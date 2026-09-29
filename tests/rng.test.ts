import { describe, expect, it } from 'vitest';

import { createRng, int, next, restoreRng, shuffle } from '@sim/rng.ts';

const SEED = 12345;
const SAMPLE = 20;
const MANY = 1000;

function take(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => next(rng));
}

describe('seeded rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(SEED, SAMPLE)).toEqual(take(SEED, SAMPLE));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(SEED, SAMPLE)).not.toEqual(take(SEED + 1, SAMPLE));
  });

  it('matches known mulberry32 output', () => {
    // Regression guard: changing the algorithm would break saved matches.
    const rng = createRng(SEED);
    expect(next(rng)).toBeCloseTo(0.9797282677609473, 12);
  });

  it('next() stays in [0, 1)', () => {
    for (const v of take(SEED, MANY)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) stays in [0, n) and hits every value', () => {
    const rng = createRng(SEED);
    const bound = 6;
    const seen = new Set<number>();
    for (let i = 0; i < MANY; i++) {
      const v = int(rng, bound);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(bound);
      seen.add(v);
    }
    expect(seen.size).toBe(bound);
  });

  it('int rejects non-positive or non-integer bounds', () => {
    const rng = createRng(SEED);
    expect(() => int(rng, 0)).toThrow(RangeError);
    expect(() => int(rng, 1.5)).toThrow(RangeError);
  });

  it('shuffle is a deterministic permutation and does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(createRng(SEED), input);
    const b = shuffle(createRng(SEED), input);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).not.toEqual(input);
  });

  it('serialized state resumes the exact stream', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < SAMPLE; i++) next(rng);
    const saved = JSON.parse(JSON.stringify(rng)) as typeof rng;
    const resumed = restoreRng(saved);
    expect(Array.from({ length: SAMPLE }, () => next(resumed))).toEqual(
      Array.from({ length: SAMPLE }, () => next(rng)),
    );
  });
});
