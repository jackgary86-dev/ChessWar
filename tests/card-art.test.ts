import { describe, expect, it } from 'vitest';
import { cardClasses, tierLabel } from '../src/ui/card-art.ts';

describe('card frames', () => {
  it('labels and colors each tier', () => {
    expect([1, 2, 3, 4].map(tierLabel)).toEqual(['T1', 'T2', 'T3', 'T4']);
    for (const tier of [1, 2, 3, 4] as const) {
      expect(cardClasses({ tier, unaffordable: false }, false)).toBe(`card t${String(tier)}`);
    }
  });

  it('adds state classes for unaffordable cards and a locked shop', () => {
    expect(cardClasses({ tier: 2, unaffordable: true }, false)).toBe('card t2 poor');
    expect(cardClasses({ tier: 3, unaffordable: false }, true)).toBe('card t3 held');
    expect(cardClasses({ tier: 4, unaffordable: true }, true)).toBe('card t4 poor held');
  });
});
