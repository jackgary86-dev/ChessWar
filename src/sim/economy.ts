/**
 * Income, interest, streaks, XP and levels (spec §3.4).
 *
 * The streak is signed: positive is a win streak, negative a loss streak,
 * zero after a draw. All numbers come from `data.ts`.
 */
import { ECONOMY, PLAYER, XP_TO_NEXT_LEVEL, boardCap } from './data.ts';
import type { Level, LevellingLevel } from './types.ts';

export interface Economy {
  gold: number;
  level: Level;
  /** XP toward the next level. Always 0 at the level cap. */
  xp: number;
  /** Signed streak: + wins in a row, − losses in a row, 0 after a draw. */
  streak: number;
  /** Did this player win the previous fight? */
  lastWon: boolean;
}

/** Where one round's income came from. */
export interface IncomeBreakdown {
  base: number;
  interest: number;
  streak: number;
  win: number;
  total: number;
}

export type FightOutcome = 'win' | 'loss' | 'draw';

export function createEconomy(): Economy {
  return { gold: 0, level: PLAYER.startLevel, xp: 0, streak: 0, lastWon: false };
}

/** Gold bonus for the length of a win or loss streak. */
export function streakBonus(streak: number): number {
  const length = Math.abs(streak);
  return ECONOMY.streakBonuses.find((tier) => length >= tier.streak)?.bonus ?? 0;
}

/** Interest on banked gold, capped. */
export function interest(gold: number): number {
  return Math.min(ECONOMY.interestCap, Math.floor(gold / ECONOMY.interestPerGold));
}

/** Income granted at the start of a round (1-based) for the given state. */
export function roundIncome(round: number, econ: Readonly<Economy>): IncomeBreakdown {
  if (round <= 1) {
    return {
      base: ECONOMY.roundOneIncome,
      interest: 0,
      streak: 0,
      win: 0,
      total: ECONOMY.roundOneIncome,
    };
  }
  const base = Math.min(ECONOMY.baseIncomeCap, round + ECONOMY.baseIncomeRoundOffset);
  const interestGold = interest(econ.gold);
  const streak = streakBonus(econ.streak);
  const win = econ.lastWon ? ECONOMY.winBonus : 0;
  return { base, interest: interestGold, streak, win, total: base + interestGold + streak + win };
}

/** Add XP, levelling up as far as it allows. XP is discarded at the level cap. */
export function addXp(econ: Economy, amount: number): void {
  econ.xp += amount;
  while (econ.level < PLAYER.maxLevel) {
    const needed = XP_TO_NEXT_LEVEL[econ.level as LevellingLevel];
    if (econ.xp < needed) break;
    econ.xp -= needed;
    econ.level = (econ.level + 1) as Level;
  }
  if (econ.level >= PLAYER.maxLevel) econ.xp = 0;
}

/** Start of a round: pay income and grant the free XP from round 2. */
export function startRoundEconomy(econ: Economy, round: number): IncomeBreakdown {
  const income = roundIncome(round, econ);
  econ.gold += income.total;
  if (round >= ECONOMY.xpPerRoundFrom) addXp(econ, ECONOMY.xpPerRound);
  return income;
}

/** Buy XP for gold. False (and no change) when short of gold or at the level cap. */
export function buyXp(econ: Economy): boolean {
  if (econ.level >= PLAYER.maxLevel || econ.gold < ECONOMY.xpPurchaseCost) return false;
  econ.gold -= ECONOMY.xpPurchaseCost;
  addXp(econ, ECONOMY.xpPurchaseAmount);
  return true;
}

/** Update the streak and last-win flag after a fight. */
export function recordFight(econ: Economy, outcome: FightOutcome): void {
  econ.lastWon = outcome === 'win';
  if (outcome === 'draw') econ.streak = 0;
  else if (outcome === 'win') econ.streak = econ.streak > 0 ? econ.streak + 1 : 1;
  else econ.streak = econ.streak < 0 ? econ.streak - 1 : -1;
}

/** Can another piece go on the board? Board size is capped by level. */
export function canPlaceOnBoard(econ: Readonly<Economy>, piecesOnBoard: number): boolean {
  return piecesOnBoard < boardCap(econ.level);
}
