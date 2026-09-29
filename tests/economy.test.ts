import { describe, expect, it } from 'vitest';

import { boardCap } from '@sim/data.ts';
import {
  addXp,
  buyXp,
  canPlaceOnBoard,
  createEconomy,
  interest,
  recordFight,
  roundIncome,
  startRoundEconomy,
  streakBonus,
} from '@sim/economy.ts';
import type { Economy } from '@sim/economy.ts';

function econ(patch: Partial<Economy> = {}): Economy {
  return { ...createEconomy(), ...patch };
}

describe('income', () => {
  it('round 1 gives 3 gold and nothing else', () => {
    expect(roundIncome(1, econ({ gold: 50, streak: 5, lastWon: true }))).toEqual({
      base: 3,
      interest: 0,
      streak: 0,
      win: 0,
      total: 3,
    });
  });

  it('breaks down base, interest, streak and win bonus', () => {
    // Round 3: base 5; 27 gold gives 2 interest; a 4-streak gives 2; last fight won +1.
    expect(roundIncome(3, econ({ gold: 27, streak: 4, lastWon: true }))).toEqual({
      base: 5,
      interest: 2,
      streak: 2,
      win: 1,
      total: 10,
    });
  });

  it('base income is min(5, round + 2)', () => {
    expect([2, 3, 4, 10].map((r) => roundIncome(r, econ()).base)).toEqual([4, 5, 5, 5]);
  });

  it('caps interest at 5', () => {
    expect(interest(9)).toBe(0);
    expect(interest(10)).toBe(1);
    expect(interest(49)).toBe(4);
    expect(interest(50)).toBe(5);
    expect(interest(500)).toBe(5);
  });

  it('gives streak bonuses for wins and losses alike', () => {
    const bonuses = [0, 1, 2, 3, 4, 5, 6, 9].map((n) => streakBonus(n));
    expect(bonuses).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(streakBonus(-2)).toBe(1);
    expect(streakBonus(-6)).toBe(3);
  });

  it('adds only the win bonus when nothing else applies', () => {
    expect(roundIncome(2, econ({ lastWon: true })).total).toBe(4 + 1);
    expect(roundIncome(2, econ({ lastWon: false })).total).toBe(4);
  });
});

describe('streaks', () => {
  it('extends a win streak, flips on a loss, and resets on a draw', () => {
    const e = econ();
    recordFight(e, 'win');
    recordFight(e, 'win');
    expect(e).toMatchObject({ streak: 2, lastWon: true });
    recordFight(e, 'loss');
    expect(e).toMatchObject({ streak: -1, lastWon: false });
    recordFight(e, 'loss');
    expect(e.streak).toBe(-2);
    recordFight(e, 'draw');
    expect(e).toMatchObject({ streak: 0, lastWon: false });
    recordFight(e, 'win');
    expect(e.streak).toBe(1);
  });
});

describe('XP and levels', () => {
  it('starts at level 2 and needs 2/4/6/10/14/20 XP per level', () => {
    const e = econ();
    expect(e.level).toBe(2);
    const seen: number[] = [];
    for (const need of [2, 4, 6, 10, 14, 20]) {
      const level = e.level;
      addXp(e, need - 1);
      expect(e.level).toBe(level);
      addXp(e, 1);
      expect(e.level).toBe(level + 1);
      expect(e.xp).toBe(0);
      seen.push(e.level);
    }
    expect(seen).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('carries leftover XP and can gain several levels at once', () => {
    const e = econ();
    addXp(e, 7); // 2 -> level 3, 4 -> level 4, leaving 1
    expect(e).toMatchObject({ level: 4, xp: 1 });
  });

  it('caps at level 8 and drops surplus XP', () => {
    const e = econ();
    addXp(e, 1000);
    expect(e).toMatchObject({ level: 8, xp: 0 });
  });

  it('grants +1 XP each round from round 2, but not in round 1', () => {
    const e = econ();
    startRoundEconomy(e, 1);
    expect(e).toMatchObject({ gold: 3, xp: 0 });
    startRoundEconomy(e, 2);
    expect(e.xp).toBe(1);
    startRoundEconomy(e, 3);
    expect(e).toMatchObject({ level: 3, xp: 0 });
  });

  it('buying XP costs 4 gold for 4 XP and refuses when short or capped', () => {
    const e = econ({ gold: 5 });
    expect(buyXp(e)).toBe(true);
    expect(e).toMatchObject({ gold: 1, level: 3, xp: 2 });
    expect(buyXp(e)).toBe(false);
    expect(e.gold).toBe(1);
    const maxed = econ({ gold: 100, level: 8 });
    expect(buyXp(maxed)).toBe(false);
    expect(maxed.gold).toBe(100);
  });
});

describe('board cap', () => {
  it('allows as many pieces as the level, up to 8', () => {
    for (const level of [2, 3, 4, 5, 6, 7, 8] as const) {
      const e = econ({ level });
      expect(boardCap(level)).toBe(level);
      expect(canPlaceOnBoard(e, level - 1)).toBe(true);
      expect(canPlaceOnBoard(e, level)).toBe(false);
    }
  });
});
