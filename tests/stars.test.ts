import { describe, expect, it } from 'vitest';
import { pipOffsets, starStyle } from '../src/ui/stars.ts';

describe('starStyle', () => {
  it('gives each level a distinct treatment', () => {
    const [one, two, three] = [starStyle(1), starStyle(2), starStyle(3)];
    expect(one.ring).toBeNull();
    expect(two.ring).not.toBeNull();
    expect(three.ring).not.toBeNull();
    expect(new Set([one.pip, two.pip, three.pip]).size).toBe(3);
    expect(three.ring).not.toBe(two.ring);
  });

  it('shows one pip per star, and only 3★ glows', () => {
    expect([1, 2, 3].map((n) => starStyle(n as 1 | 2 | 3).pips)).toEqual([1, 2, 3]);
    expect(starStyle(1).glow).toBeNull();
    expect(starStyle(2).glow).toBeNull();
    expect(starStyle(3).glow).not.toBeNull();
  });
});

describe('pipOffsets', () => {
  it('centers the pips on the piece', () => {
    expect(pipOffsets(1, 10)).toEqual([0]);
    expect(pipOffsets(2, 10)).toEqual([-5, 5]);
    expect(pipOffsets(3, 10)).toEqual([-10, 0, 10]);
  });
});
