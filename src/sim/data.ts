/**
 * Balance data: the single source of truth for every tunable number.
 *
 * Sections follow docs/CODER_PROMPT.md §3.2 (pieces), §3.3 (combat),
 * §3.4 (economy) and §3.6 (AI). Nothing else in src/ may hard-code a
 * balance value; an ESLint no-magic-numbers rule on src/sim enforces that.
 *
 * Everything is exported `as const` and frozen so a stray mutation fails loudly.
 */
import type { AbilityStar, Level, LevellingLevel, PieceType, StarLevel, Tier } from './types.ts';

/** A value that changes with the ability's star level. */
export type StarScaled = Readonly<Record<AbilityStar, number>>;

export interface PieceDef {
  readonly type: PieceType;
  readonly name: string;
  /** Chess glyph with U+FE0E so it renders as text, not emoji. */
  readonly glyph: string;
  readonly cost: number;
  readonly tier: Tier;
  /** 1★ hit points. */
  readonly hp: number;
  /** 1★ attack. */
  readonly atk: number;
  /** Acts once every `speed` ticks. */
  readonly speed: number;
  /** Maximum strike distance for sliding pieces. Undefined for fixed patterns. */
  readonly strikeRange?: number;
  readonly ability: AbilityDef;
}

export interface AbilityDef {
  readonly name: string;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Pieces (§3.2)
// ---------------------------------------------------------------------------

/** Piece types in shop and display order. */
export const PIECE_ORDER = Object.freeze([
  'P',
  'N',
  'B',
  'R',
  'Q',
] as const) satisfies readonly PieceType[];

/** Sliding pieces strike up to this many squares away, with line of sight. */
export const SLIDER_STRIKE_RANGE = 3;

export const PIECES: Readonly<Record<PieceType, PieceDef>> = Object.freeze({
  P: {
    type: 'P',
    name: 'Pawn',
    glyph: '♟︎',
    cost: 1,
    tier: 1,
    hp: 380,
    atk: 45,
    speed: 2,
    ability: {
      name: 'Shield Wall',
      description: 'Takes less damage while a friendly piece is orthogonally adjacent.',
    },
  },
  N: {
    type: 'N',
    name: 'Knight',
    glyph: '♞︎',
    cost: 2,
    tier: 2,
    hp: 520,
    atk: 70,
    speed: 2,
    ability: {
      name: 'Fork',
      description: 'Also hits other enemies on its knight squares.',
    },
  },
  B: {
    type: 'B',
    name: 'Bishop',
    glyph: '♝︎',
    cost: 2,
    tier: 2,
    hp: 440,
    atk: 58,
    speed: 2,
    strikeRange: SLIDER_STRIKE_RANGE,
    ability: {
      name: 'Blessing',
      description: 'Each strike heals the most wounded ally.',
    },
  },
  R: {
    type: 'R',
    name: 'Rook',
    glyph: '♜︎',
    cost: 3,
    tier: 3,
    hp: 780,
    atk: 72,
    speed: 3,
    strikeRange: SLIDER_STRIKE_RANGE,
    ability: {
      name: 'Fortress',
      description: 'Takes less damage.',
    },
  },
  Q: {
    type: 'Q',
    name: 'Queen',
    glyph: '♛︎',
    cost: 5,
    tier: 4,
    hp: 720,
    atk: 95,
    speed: 2,
    strikeRange: SLIDER_STRIKE_RANGE,
    ability: {
      name: 'Pierce',
      description: 'Strikes also hit the enemy directly behind the target.',
    },
  },
});

/** HP multiplier by star level. */
export const STAR_HP_MULT: Readonly<Record<StarLevel, number>> = Object.freeze({
  1: 1,
  2: 1.9,
  3: 3.5,
});

/** ATK multiplier by star level. */
export const STAR_ATK_MULT: Readonly<Record<StarLevel, number>> = Object.freeze({
  1: 1,
  2: 1.8,
  3: 3.3,
});

/** Ability tuning by star level (2★ / 3★). */
export const ABILITY = Object.freeze({
  /** Pawn Shield Wall: damage reduction while a friendly piece is orthogonally adjacent. */
  shieldWallReduction: Object.freeze({ 2: 0.15, 3: 0.3 }) satisfies StarScaled,
  /** Knight Fork: extra enemies hit on its knight squares (Infinity = all). */
  forkExtraTargets: Object.freeze({ 2: 1, 3: Number.POSITIVE_INFINITY }) satisfies StarScaled,
  /** Bishop Blessing: heal to the most wounded ally as a fraction of ATK. */
  blessingHealRatio: Object.freeze({ 2: 0.6, 3: 1.2 }) satisfies StarScaled,
  /** Rook Fortress: flat damage reduction. */
  fortressReduction: Object.freeze({ 2: 0.2, 3: 0.35 }) satisfies StarScaled,
  /** Queen Pierce: damage to the enemy behind the target as a fraction of the strike. */
  pierceRatio: Object.freeze({ 2: 0.5, 3: 1 }) satisfies StarScaled,
});

// ---------------------------------------------------------------------------
// Combat (§3.3)
// ---------------------------------------------------------------------------

export const BATTLE = Object.freeze({
  /** A fight is decided on material once it reaches this tick. */
  maxTicks: 220,
  /** A fight is decided on material after this many ticks without damage. */
  idleTickLimit: 26,
  /** Every strike deals at least this much damage. */
  minDamage: 1,
  /** Presentation length of one tick at 1× speed. */
  tickMs: 420,
  /** Playback speed multipliers offered in the UI. */
  speeds: Object.freeze([1, 2, 4] as const),
});

// ---------------------------------------------------------------------------
// Economy and progression (§3.4)
// ---------------------------------------------------------------------------

export const PLAYER = Object.freeze({
  startHp: 50,
  startLevel: 2 satisfies Level,
  minLevel: 2 satisfies Level,
  maxLevel: 8 satisfies Level,
  /** Pieces allowed on the board = level, capped here. */
  maxBoardPieces: 8,
  benchSize: 8,
  shopSize: 5,
});

/** XP needed to advance from each level to the next. */
export const XP_TO_NEXT_LEVEL: Readonly<Record<LevellingLevel, number>> = Object.freeze({
  2: 2,
  3: 4,
  4: 6,
  5: 10,
  6: 14,
  7: 20,
});

export const ECONOMY = Object.freeze({
  /** Gold given in round 1. */
  roundOneIncome: 3,
  /** From round 2, base income is min(baseIncomeCap, round + baseIncomeRoundOffset). */
  baseIncomeCap: 5,
  baseIncomeRoundOffset: 2,
  /** One gold of interest per this much banked gold. */
  interestPerGold: 10,
  interestCap: 5,
  /** Extra gold for winning the previous fight. */
  winBonus: 1,
  /**
   * Streak bonus thresholds, checked from the top: an absolute streak of at
   * least `streak` (win or loss) earns `bonus` gold.
   */
  streakBonuses: Object.freeze([
    Object.freeze({ streak: 6, bonus: 3 }),
    Object.freeze({ streak: 4, bonus: 2 }),
    Object.freeze({ streak: 2, bonus: 1 }),
  ]),
  rerollCost: 2,
  xpPurchaseCost: 4,
  xpPurchaseAmount: 4,
  /** Free XP each round, starting from `xpPerRoundFrom`. */
  xpPerRound: 1,
  xpPerRoundFrom: 2,
});

/** Copies of one star level that merge into the next. Also the sell-value base. */
export const MERGE_COUNT = 3;

/** Shared piece pool at 1★ copies. */
export const POOL_SIZE: Readonly<Record<PieceType, number>> = Object.freeze({
  P: 30,
  N: 18,
  B: 18,
  R: 14,
  Q: 9,
});

/** Shop odds in percent by level, indexed T1..T4. Each row sums to 100. */
export const TIER_ODDS: Readonly<Record<Level, readonly [number, number, number, number]>> =
  Object.freeze({
    2: [70, 30, 0, 0],
    3: [50, 45, 5, 0],
    4: [40, 45, 15, 0],
    5: [30, 42, 25, 3],
    6: [22, 38, 32, 8],
    7: [15, 33, 37, 15],
    8: [10, 28, 40, 22],
  });

/** Player HP lost after a fight. */
export const FIGHT_DAMAGE = Object.freeze({
  /** Loser takes lossBase + winner's surviving stars + floor(round / lossRoundDivisor). */
  lossBase: 2,
  lossRoundDivisor: 4,
  /** Each player loses this on a draw. */
  drawDamage: 2,
});

// ---------------------------------------------------------------------------
// AI opponent (§3.6)
// ---------------------------------------------------------------------------

export const AI = Object.freeze({
  /** Target level each round: min(maxLevel, levelBase + floor((round + levelRoundOffset) / levelRoundDivisor)). */
  levelBase: 2,
  levelRoundOffset: 1,
  levelRoundDivisor: 2,
  /** Fill the army up to level + this many pieces. */
  armyOverLevel: 1,
  /** Keep this much gold for interest, from `interestReserveFromRound`. */
  interestReserve: 10,
  interestReserveFromRound: 6,
  /** Reroll up to `maxRerolls` times when holding at least `rerollMinGold`, from `rerollFromRound`. */
  rerollMinGold: 16,
  rerollFromRound: 5,
  maxRerolls: 2,
});

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

/** 1★ copies represented by a piece of the given star level (3^(stars−1)). */
export function copiesForStars(stars: StarLevel): number {
  return MERGE_COUNT ** (stars - 1);
}

/** Hit points of a piece at a star level. */
export function unitHp(type: PieceType, stars: StarLevel): number {
  return Math.round(PIECES[type].hp * STAR_HP_MULT[stars]);
}

/** Attack of a piece at a star level. */
export function unitAtk(type: PieceType, stars: StarLevel): number {
  return Math.round(PIECES[type].atk * STAR_ATK_MULT[stars]);
}

/** Gold refunded when selling a piece. */
export function sellValue(type: PieceType, stars: StarLevel): number {
  return PIECES[type].cost * copiesForStars(stars);
}

/** Pieces a player may field at a level. */
export function boardCap(level: Level): number {
  return Math.min(level, PLAYER.maxBoardPieces);
}
