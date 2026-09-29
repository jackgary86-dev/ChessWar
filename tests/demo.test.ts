import { describe, expect, it } from 'vitest';
import { createAiPrep } from '@sim/ai.ts';
import { buyCard, createGame, nextRound, ready, skipCombat } from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import {
  DEMO_ROUNDS,
  demoFinished,
  demoTip,
  fullGameHref,
  isDemo,
  mergeNudge,
} from '../src/ui/demo-model.ts';
import { overlayView } from '../src/ui/overlays-model.ts';

const aiPrep = createAiPrep('normal');
const fresh = (): GameState => createGame({ mode: 'ai', seed: 7 }, aiPrep);

describe('demo flag', () => {
  it('reads ?demo from the query string', () => {
    expect(isDemo('?demo')).toBe(true);
    expect(isDemo('?demo=1')).toBe(true);
    expect(isDemo('?x=1&demo')).toBe(true);
    expect(isDemo('')).toBe(false);
    expect(isDemo('?demo=0')).toBe(false);
  });
  it('builds a link to the full game', () => {
    expect(fullGameHref('https://x.test/play/?demo&a=1')).toBe('https://x.test/play/?a=1');
  });
});

describe('guided first round', () => {
  it('walks shop, placement, portals', () => {
    const game = fresh();
    expect(demoTip(game)?.step).toBe('shop');
    expect(buyCard(game, 0, 0)).toBe('ok');
    expect(demoTip(game)?.step).toBe('place');
    const piece = game.players[0].holdings.bench.find((p) => p !== null);
    if (!piece) throw new Error('bought piece missing');
    game.players[0].holdings.bench[game.players[0].holdings.bench.indexOf(piece)] = null;
    game.players[0].holdings.board.push({ ...piece, x: 0, y: 0 });
    expect(demoTip(game)?.step).toBe('portals');
    expect(demoTip(game)?.text).toMatch(/portal/i);
  });
  it('mentions merging in the shop tip and nudges at two copies', () => {
    const game = fresh();
    expect(demoTip(game)?.text).toMatch(/merge/i);
    const bench = game.players[0].holdings.bench;
    bench[0] = { id: 901, type: 'P', stars: 1 };
    expect(mergeNudge(game)).toBeNull();
    bench[1] = { id: 902, type: 'P', stars: 1 };
    expect(mergeNudge(game)).toMatch(/merge/i);
  });
  it('is silent after round 1', () => {
    const game = fresh();
    game.round = 2;
    expect(demoTip(game)).toBeNull();
  });
});

describe('demo length and end screen', () => {
  function playRound(game: GameState): void {
    ready(game);
    skipCombat(game);
  }
  it('finishes after the fifth round and invites the full game', () => {
    const game = fresh();
    for (let r = 1; r < DEMO_ROUNDS; r++) {
      playRound(game);
      if ((game.phase as string) === 'over') return; // a commander fell early: also an end
      expect(demoFinished(game)).toBe(false);
      nextRound(game, aiPrep);
      if ((game.phase as string) === 'over') return;
    }
    playRound(game);
    expect(demoFinished(game)).toBe(true);
    const before = overlayView(game, { started: true, animationDone: true, demo: true });
    expect(before?.kind).toBe('result');
    if (before?.kind === 'result' && game.phase === 'result') {
      expect(before.button).toBe('Finish demo');
    }
    const end = overlayView(game, {
      started: true,
      animationDone: true,
      demo: true,
      demoDone: true,
    });
    expect(end?.kind).toBe('demo-end');
  });
  it('demo start screen offers only the demo', () => {
    const view = overlayView(fresh(), {
      started: false,
      animationDone: true,
      demo: true,
      canContinue: true,
    });
    expect(view).toMatchObject({ kind: 'start', demo: true, canContinue: false });
  });
  it('outside the demo nothing changes', () => {
    const game = fresh();
    playRound(game);
    const view = overlayView(game, { started: true, animationDone: true });
    expect(view).toMatchObject({ kind: 'result', button: 'Next round' });
  });
});
