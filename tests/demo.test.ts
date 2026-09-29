import { describe, expect, it } from 'vitest';
import { createGame, nextRound, ready, skipCombat } from '@sim/game.ts';
import {
  DEMO_ROUNDS,
  DEMO_TIPS,
  demoIsOver,
  demoOutcome,
  demoTip,
  fullGameUrl,
  isDemoUrl,
} from '../src/ui/demo.ts';
import { overlayView } from '../src/ui/overlays-model.ts';

const demoContext = (over: boolean) =>
  ({
    started: true,
    animationDone: true,
    demo: { over, outcome: 'win', rounds: DEMO_ROUNDS },
  }) as const;

describe('demo flag', () => {
  it('is on for ?demo and ?demo=1, off otherwise', () => {
    expect(isDemoUrl('?demo')).toBe(true);
    expect(isDemoUrl('?demo=1')).toBe(true);
    expect(isDemoUrl('?x=1&demo')).toBe(true);
    expect(isDemoUrl('')).toBe(false);
    expect(isDemoUrl('?server=ws://a')).toBe(false);
  });

  it('links to the same page without the flag', () => {
    expect(fullGameUrl('https://x.test/chess/?demo&server=ws%3A%2F%2Fa')).toBe(
      'https://x.test/chess/?server=ws%3A%2F%2Fa',
    );
    expect(fullGameUrl('https://x.test/?demo=1')).toBe('https://x.test/');
  });
});

describe('guided first round', () => {
  it('covers shop, placement, portals and merging, then the fight', () => {
    const text = DEMO_TIPS.join(' ').toLowerCase();
    for (const word of ['shop', 'placement', 'portal', 'merg', 'fight'])
      expect(text).toContain(word);
  });

  it('shows tips only in round 1 prep, in order, and marks the last one', () => {
    const game = createGame({ mode: 'ai', seed: 1 });
    expect(demoTip(game, 0)?.text).toBe(DEMO_TIPS[0]);
    expect(demoTip(game, 0)?.last).toBe(false);
    expect(demoTip(game, DEMO_TIPS.length - 1)?.last).toBe(true);
    expect(demoTip(game, DEMO_TIPS.length)).toBeNull();
    expect(demoTip(game, Number.POSITIVE_INFINITY)).toBeNull();
    ready(game);
    skipCombat(game);
    expect(demoTip(game, 0)).toBeNull(); // result phase
    nextRound(game);
    expect(demoTip(game, 0)).toBeNull(); // round 2
  });
});

describe('demo length and end screen', () => {
  it('is 5 rounds', () => {
    expect(DEMO_ROUNDS).toBe(5);
  });

  it('ends after the last demo round result is dismissed, or when the war ends sooner', () => {
    const game = createGame({ mode: 'ai', seed: 2 });
    expect(demoIsOver(game, false)).toBe(false);
    game.round = DEMO_ROUNDS;
    expect(demoIsOver(game, false)).toBe(false);
    expect(demoIsOver(game, true)).toBe(true);
    game.round = 2;
    expect(demoIsOver(game, true)).toBe(false);
    game.phase = 'over';
    expect(demoIsOver(game, false)).toBe(true);
  });

  it('scores the demo by remaining HP', () => {
    const game = createGame({ mode: 'ai', seed: 3 });
    expect(demoOutcome(game)).toBe('draw');
    game.players[1].hp -= 5;
    expect(demoOutcome(game)).toBe('win');
    game.players[0].hp -= 10;
    expect(demoOutcome(game)).toBe('lose');
  });

  it('start screen offers the demo only, and never a saved war', () => {
    const game = createGame({ mode: 'ai', seed: 4 });
    expect(
      overlayView(game, {
        started: false,
        animationDone: true,
        canContinue: true,
        demo: { over: false, outcome: 'win', rounds: DEMO_ROUNDS },
      }),
    ).toEqual({ kind: 'start', canContinue: false, demo: true });
  });

  it('shows an invitation to the full game when the demo is over', () => {
    const game = createGame({ mode: 'ai', seed: 5 });
    expect(overlayView(game, demoContext(false))).toBeNull();
    expect(overlayView(game, demoContext(true))).toMatchObject({
      kind: 'over',
      title: 'That was the demo',
      button: 'Play the full game',
      tone: 'win',
    });
  });

  it('a normal game is unaffected', () => {
    const game = createGame({ mode: 'ai', seed: 6 });
    expect(overlayView(game, { started: false, animationDone: true })).toEqual({
      kind: 'start',
      canContinue: false,
    });
  });
});
