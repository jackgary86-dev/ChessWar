import { describe, expect, it } from 'vitest';
import { boardCap } from '@sim/data.ts';
import { createAiPrep } from '@sim/ai.ts';
import { buyCard, createGame, nextRound, ready, skipCombat } from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import {
  DEMO_ROUNDS,
  FIRST_MATCH_TIP_ROUNDS,
  demoFinished,
  demoTip,
  firstMatchTip,
  fullGameHref,
  isDemo,
  mergeNudge,
} from '../src/ui/demo-model.ts';
import { TIPS_KEY, markTipsDone, tipsDone } from '../src/ui/storage.ts';
import type { StorageLike } from '../src/ui/storage.ts';
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

describe('first-match hints in the full game', () => {
  function fillBoard(game: GameState, count: number, benched: boolean): void {
    const { holdings } = game.players[0];
    for (let i = 0; i < count; i++) {
      holdings.board.push({ id: 800 + i, type: 'P', stars: 1, x: i, y: 0 });
    }
    if (benched) holdings.bench[0] = { id: 850, type: 'R', stars: 1 };
  }
  it('is the same guidance the demo shows', () => {
    const game = fresh();
    expect(firstMatchTip(game)).toEqual(demoTip(game));
  });
  it('explains the board cap when the board is full and a piece waits on the bench', () => {
    const game = fresh();
    const cap = boardCap(game.players[0].econ.level);
    fillBoard(game, cap, true);
    const tip = firstMatchTip(game);
    expect(tip?.step).toBe('cap');
    expect(tip?.text).toMatch(/level/i);
  });
  it('does not mention the cap while there is room or nothing on the bench', () => {
    const roomy = fresh();
    fillBoard(roomy, boardCap(roomy.players[0].econ.level) - 1, true);
    expect(firstMatchTip(roomy)?.step).toBe('portals');
    const noBench = fresh();
    fillBoard(noBench, boardCap(noBench.players[0].econ.level), false);
    expect(firstMatchTip(noBench)?.step).toBe('portals');
  });
  it('shows only the cap hint in rounds 2 and 3, and nothing later or during a fight', () => {
    const game = fresh();
    game.round = 2;
    expect(firstMatchTip(game)).toBeNull();
    fillBoard(game, boardCap(game.players[0].econ.level), true);
    expect(firstMatchTip(game)?.step).toBe('cap');
    game.round = FIRST_MATCH_TIP_ROUNDS + 1;
    expect(firstMatchTip(game)).toBeNull();
    game.round = 1;
    game.phase = 'combat';
    expect(firstMatchTip(game)).toBeNull();
  });
  it('remembers that the hints were seen, and survives blocked storage', () => {
    const data = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
      removeItem: (k) => {
        data.delete(k);
      },
    };
    expect(tipsDone(storage)).toBe(false);
    markTipsDone(storage);
    expect(data.get(TIPS_KEY)).toBe('1');
    expect(tipsDone(storage)).toBe(true);
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    expect(tipsDone(blocked)).toBe(false);
    expect(() => {
      markTipsDone(blocked);
    }).not.toThrow();
    expect(tipsDone(null)).toBe(false);
  });
});
