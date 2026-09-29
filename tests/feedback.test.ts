import { describe, expect, it } from 'vitest';
import type { Holdings } from '../src/sim/shop.ts';
import { FEEDBACK_MS, activeMerges, detectPrepFeedback } from '../src/ui/feedback.ts';
import { drawMerge, mergeBurst } from '../src/ui/vfx.ts';
import { frameAt } from '../src/ui/animation.ts';

const holdings = (bench: Holdings['bench'], board: Holdings['board'] = []): Holdings => ({
  bench,
  board,
  nextId: 100,
});

describe('detectPrepFeedback', () => {
  it('finds a bench merge and a board merge', () => {
    const before = holdings(
      [{ id: 1, type: 'P', stars: 1 }, null],
      [{ id: 2, type: 'N', stars: 1, x: 3, y: 4 }],
    );
    const after = holdings(
      [{ id: 1, type: 'P', stars: 2 }, null],
      [{ id: 2, type: 'N', stars: 2, x: 3, y: 4 }],
    );
    const fx = detectPrepFeedback(before, after, 2, 2);
    expect(fx.merges).toEqual([
      { type: 'N', stars: 2, where: { kind: 'board', pos: { x: 3, y: 4 } } },
      { type: 'P', stars: 2, where: { kind: 'bench', slot: 0 } },
    ]);
    expect(fx.levelUp).toBe(false);
  });

  it('does not celebrate a plain buy, and flags a level-up', () => {
    const before = holdings([null, null]);
    const after = holdings([{ id: 5, type: 'B', stars: 1 }, null]);
    expect(detectPrepFeedback(before, after, 2, 2).merges).toEqual([]);
    expect(detectPrepFeedback(before, before, 2, 3).levelUp).toBe(true);
  });

  it('counts a new piece that arrives already merged', () => {
    const fx = detectPrepFeedback(
      holdings([null]),
      holdings([{ id: 9, type: 'Q', stars: 2 }]),
      2,
      2,
    );
    expect(fx.merges).toHaveLength(1);
  });
});

describe('merge burst', () => {
  it('runs for a fixed time and prunes', () => {
    const timed = [{ pos: { x: 1, y: 1 }, stars: 2 as const, startMs: 1000 }];
    expect(activeMerges(timed, 1000)[0]?.progress).toBe(0);
    expect(activeMerges(timed, 1000 + FEEDBACK_MS / 2)[0]?.progress).toBeCloseTo(0.5);
    expect(activeMerges(timed, 1000 + FEEDBACK_MS)).toEqual([]);
  });

  it('shows one spark per star level, rising and growing a ring', () => {
    expect(mergeBurst(0.5, 2).sparks).toHaveLength(2);
    expect(mergeBurst(0.5, 3).sparks).toHaveLength(3);
    expect(mergeBurst(1, 2).ringRadius).toBeGreaterThan(mergeBurst(0, 2).ringRadius);
    expect(mergeBurst(1, 2).sparks[0]?.dy).toBeLessThan(mergeBurst(0, 2).sparks[0]?.dy ?? 0);
  });

  it('is exported for the renderer and frameAt is unaffected in prep', () => {
    expect(typeof drawMerge).toBe('function');
    expect(frameAt([], [], 0, false).effects).toEqual([]);
  });
});
