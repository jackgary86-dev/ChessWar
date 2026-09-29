import { describe, expect, it } from 'vitest';

import {
  ABILITY,
  AI,
  BATTLE,
  ECONOMY,
  FIGHT_DAMAGE,
  MERGE_COUNT,
  PIECE_ORDER,
  PIECES,
  PLAYER,
  POOL_SIZE,
  SLIDER_STRIKE_RANGE,
  STAR_ATK_MULT,
  STAR_HP_MULT,
  TIER_ODDS,
  XP_TO_NEXT_LEVEL,
  boardCap,
  copiesForStars,
  sellValue,
  unitAtk,
  unitHp,
} from '@sim/data.ts';
import type { Level, PieceType, StarLevel } from '@sim/types.ts';

const LEVELS: readonly Level[] = [2, 3, 4, 5, 6, 7, 8];
const STARS: readonly StarLevel[] = [1, 2, 3];

describe('pieces', () => {
  it('defines every piece type exactly once, in shop order', () => {
    expect(PIECE_ORDER).toEqual(['P', 'N', 'B', 'R', 'Q']);
    expect(Object.keys(PIECES).sort()).toEqual([...PIECE_ORDER].sort());
    for (const type of PIECE_ORDER) {
      expect(PIECES[type].type).toBe(type);
    }
  });

  it('matches the spec table (§3.2)', () => {
    const expected: Record<
      PieceType,
      [cost: number, tier: number, hp: number, atk: number, speed: number]
    > = {
      P: [1, 1, 380, 45, 2],
      N: [2, 2, 520, 70, 2],
      B: [2, 2, 440, 58, 2],
      R: [3, 3, 780, 72, 3],
      Q: [5, 4, 720, 95, 2],
    };
    for (const type of PIECE_ORDER) {
      const [cost, tier, hp, atk, speed] = expected[type];
      expect(PIECES[type]).toMatchObject({ cost, tier, hp, atk, speed });
    }
  });

  it('gives sliders a strike range of 3 and leaves fixed patterns unset', () => {
    expect(SLIDER_STRIKE_RANGE).toBe(3);
    expect(PIECES.B.strikeRange).toBe(3);
    expect(PIECES.R.strikeRange).toBe(3);
    expect(PIECES.Q.strikeRange).toBe(3);
    expect(PIECES.P.strikeRange).toBeUndefined();
    expect(PIECES.N.strikeRange).toBeUndefined();
  });

  it('uses text-presentation glyphs', () => {
    for (const type of PIECE_ORDER) {
      expect(PIECES[type].glyph.endsWith('︎')).toBe(true);
    }
  });

  it('never has a cheaper piece in a higher tier', () => {
    const sorted = [...PIECE_ORDER].sort((a, b) => PIECES[a].cost - PIECES[b].cost);
    let prevTier = 0;
    for (const type of sorted) {
      expect(PIECES[type].tier).toBeGreaterThanOrEqual(prevTier);
      prevTier = PIECES[type].tier;
    }
  });
});

describe('star scaling', () => {
  it('matches the spec multipliers', () => {
    expect(STAR_HP_MULT).toEqual({ 1: 1, 2: 1.9, 3: 3.5 });
    expect(STAR_ATK_MULT).toEqual({ 1: 1, 2: 1.8, 3: 3.3 });
  });

  it('rounds scaled stats to whole numbers and grows with stars', () => {
    for (const type of PIECE_ORDER) {
      let lastHp = 0;
      let lastAtk = 0;
      for (const stars of STARS) {
        const hp = unitHp(type, stars);
        const atk = unitAtk(type, stars);
        expect(Number.isInteger(hp)).toBe(true);
        expect(Number.isInteger(atk)).toBe(true);
        expect(hp).toBeGreaterThan(lastHp);
        expect(atk).toBeGreaterThan(lastAtk);
        lastHp = hp;
        lastAtk = atk;
      }
    }
    expect(unitHp('P', 1)).toBe(380);
    expect(unitHp('P', 2)).toBe(722);
    expect(unitHp('P', 3)).toBe(1330);
    expect(unitAtk('Q', 3)).toBe(314); // 95 × 3.3 = 313.5 rounds up
  });

  it('ability values grow from 2★ to 3★', () => {
    for (const scaled of Object.values(ABILITY)) {
      expect(scaled[3]).toBeGreaterThan(scaled[2]);
    }
    expect(ABILITY.forkExtraTargets[3]).toBe(Number.POSITIVE_INFINITY);
    expect(ABILITY.pierceRatio[3]).toBe(1);
  });
});

describe('merging and selling', () => {
  it('needs 3 copies and represents 1 / 3 / 9 base copies', () => {
    expect(MERGE_COUNT).toBe(3);
    expect(copiesForStars(1)).toBe(1);
    expect(copiesForStars(2)).toBe(3);
    expect(copiesForStars(3)).toBe(9);
  });

  it('refunds cost × 3^(stars−1)', () => {
    expect(sellValue('P', 1)).toBe(1);
    expect(sellValue('Q', 2)).toBe(15);
    expect(sellValue('R', 3)).toBe(27);
  });
});

describe('pool and shop', () => {
  it('matches the spec pool sizes', () => {
    expect(POOL_SIZE).toEqual({ P: 30, N: 18, B: 18, R: 14, Q: 9 });
  });

  it('has odds for every level that sum to 100', () => {
    expect(Object.keys(TIER_ODDS).map(Number).sort()).toEqual([...LEVELS]);
    for (const level of LEVELS) {
      const row = TIER_ODDS[level];
      expect(row).toHaveLength(4);
      expect(row.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it('shifts odds toward higher tiers as level rises', () => {
    let lower: readonly [number, number, number, number] | undefined;
    for (const level of LEVELS) {
      const higher = TIER_ODDS[level];
      if (lower) {
        expect(higher[0]).toBeLessThan(lower[0]);
        expect(higher[3]).toBeGreaterThanOrEqual(lower[3]);
      }
      lower = higher;
    }
  });

  it('can supply a full merge of every piece from the pool', () => {
    for (const type of PIECE_ORDER) {
      expect(POOL_SIZE[type]).toBeGreaterThanOrEqual(copiesForStars(3));
    }
  });
});

describe('progression', () => {
  it('starts at level 2 and caps at level 8', () => {
    expect(PLAYER.startLevel).toBe(2);
    expect(PLAYER.minLevel).toBe(2);
    expect(PLAYER.maxLevel).toBe(8);
    expect(PLAYER.startHp).toBe(50);
  });

  it('has an XP step for every level below the cap and none for the cap', () => {
    expect(XP_TO_NEXT_LEVEL).toEqual({ 2: 2, 3: 4, 4: 6, 5: 10, 6: 14, 7: 20 });
    expect(Object.keys(XP_TO_NEXT_LEVEL).map(Number)).not.toContain(PLAYER.maxLevel);
  });

  it('caps the board at level up to 8', () => {
    expect(boardCap(2)).toBe(2);
    expect(boardCap(5)).toBe(5);
    expect(boardCap(8)).toBe(8);
    expect(PLAYER.maxBoardPieces).toBe(8);
    expect(PLAYER.benchSize).toBe(8);
    expect(PLAYER.shopSize).toBe(5);
  });
});

describe('economy', () => {
  it('matches the spec income rules', () => {
    expect(ECONOMY.roundOneIncome).toBe(3);
    expect(ECONOMY.baseIncomeCap).toBe(5);
    expect(ECONOMY.baseIncomeRoundOffset).toBe(2);
    expect(ECONOMY.interestPerGold).toBe(10);
    expect(ECONOMY.interestCap).toBe(5);
    expect(ECONOMY.winBonus).toBe(1);
    expect(ECONOMY.rerollCost).toBe(2);
    expect(ECONOMY.xpPurchaseCost).toBe(4);
    expect(ECONOMY.xpPurchaseAmount).toBe(4);
    expect(ECONOMY.xpPerRound).toBe(1);
    expect(ECONOMY.xpPerRoundFrom).toBe(2);
  });

  it('lists streak bonuses from largest to smallest threshold', () => {
    expect(ECONOMY.streakBonuses).toEqual([
      { streak: 6, bonus: 3 },
      { streak: 4, bonus: 2 },
      { streak: 2, bonus: 1 },
    ]);
  });

  it('matches the spec fight damage', () => {
    expect(FIGHT_DAMAGE).toEqual({ lossBase: 2, lossRoundDivisor: 4, drawDamage: 2 });
  });
});

describe('battle limits', () => {
  it('matches the spec end conditions', () => {
    expect(BATTLE.maxTicks).toBe(220);
    expect(BATTLE.idleTickLimit).toBe(26);
    expect(BATTLE.minDamage).toBe(1);
    expect(BATTLE.tickMs).toBe(420);
    expect(BATTLE.speeds).toEqual([1, 2, 4]);
  });
});

describe('AI tuning', () => {
  it('matches the spec priorities', () => {
    expect(AI).toEqual({
      levelBase: 2,
      levelRoundOffset: 1,
      levelRoundDivisor: 2,
      armyOverLevel: 1,
      interestReserve: 10,
      interestReserveFromRound: 6,
      rerollMinGold: 16,
      rerollFromRound: 5,
      maxRerolls: 2,
    });
  });
});

describe('immutability', () => {
  it('freezes every exported table', () => {
    const tables = [
      PIECES,
      STAR_HP_MULT,
      STAR_ATK_MULT,
      ABILITY,
      BATTLE,
      PLAYER,
      XP_TO_NEXT_LEVEL,
      ECONOMY,
      POOL_SIZE,
      TIER_ODDS,
      FIGHT_DAMAGE,
      AI,
    ];
    for (const table of tables) {
      expect(Object.isFrozen(table)).toBe(true);
    }
    expect(Object.isFrozen(ECONOMY.streakBonuses)).toBe(true);
    expect(Object.isFrozen(ABILITY.pierceRatio)).toBe(true);
  });
});
