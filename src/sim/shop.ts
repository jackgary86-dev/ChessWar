/**
 * Shared piece pool and shop rolling (spec §3.4).
 *
 * The pool is shared by both players. Cards sitting in a shop are out of the
 * pool; unbought cards go back on reroll. Piece counts are conserved: every
 * copy is in the pool, a shop slot, or a player's hands (bench / board).
 *
 * Also here: buying, selling, the bench and 3-copy merging.
 */
import {
  ECONOMY,
  MERGE_COUNT,
  PIECES,
  PIECE_ORDER,
  PLAYER,
  POOL_SIZE,
  TIER_ODDS,
  copiesForStars,
  sellValue,
} from './data.ts';
import { int } from './rng.ts';
import type { Rng } from './rng.ts';
import type { Level, PieceType, StarLevel, Tier } from './types.ts';

/** Copies of each piece type left to draw. */
export type Pool = Record<PieceType, number>;

export interface ShopState {
  /** Shop slots; null once a card is bought. */
  slots: (PieceType | null)[];
  /** A locked shop is kept for the next round, once. */
  locked: boolean;
}

/** Anything with gold to spend on a reroll. */
export interface Wallet {
  gold: number;
}

// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- the four shop tiers
const TIERS: readonly Tier[] = [1, 2, 3, 4];
/** Tier odds are percentages. */
const PERCENT = 100;

export function createPool(): Pool {
  return { ...POOL_SIZE };
}

/** Total copies left in the pool. */
export function poolTotal(pool: Readonly<Pool>): number {
  return PIECE_ORDER.reduce((sum, type) => sum + pool[type], 0);
}

export function createShop(): ShopState {
  return { slots: Array.from({ length: PLAYER.shopSize }, () => null), locked: false };
}

/** Put `copies` of a piece back in the pool. */
export function returnToPool(pool: Pool, type: PieceType, copies = 1): void {
  pool[type] += copies;
}

/** Draw a random copy from a tier, weighted by copies left. Null if the tier is empty. */
function drawFromTier(pool: Pool, tier: Tier, rng: Rng): PieceType | null {
  const types = PIECE_ORDER.filter((type) => PIECES[type].tier === tier && pool[type] > 0);
  let roll = int(
    rng,
    Math.max(
      1,
      types.reduce((sum, type) => sum + pool[type], 0),
    ),
  );
  for (const type of types) {
    roll -= pool[type];
    if (roll < 0) {
      pool[type] -= 1;
      return type;
    }
  }
  return null;
}

/** Pick a tier from the level's odds. */
function rollTier(level: Level, rng: Rng): Tier {
  let roll = int(rng, PERCENT);
  for (const tier of TIERS) {
    roll -= TIER_ODDS[level][tier - 1] ?? 0;
    if (roll < 0) return tier;
  }
  return 1;
}

/** Draw one card at a level; an empty tier falls back to the nearest tier with stock. */
function drawCard(pool: Pool, level: Level, rng: Rng): PieceType | null {
  const tier = rollTier(level, rng);
  const first = drawFromTier(pool, tier, rng);
  if (first !== null) return first;
  for (let distance = 1; distance < TIERS.length; distance++) {
    const below = TIERS[tier - 1 - distance];
    const above = TIERS[tier - 1 + distance];
    const found =
      (below === undefined ? null : drawFromTier(pool, below, rng)) ??
      (above === undefined ? null : drawFromTier(pool, above, rng));
    if (found !== null) return found;
  }
  return null;
}

/** Return every unbought card to the pool and deal a fresh shop. Ignores the lock. */
export function rollShop(pool: Pool, shop: ShopState, level: Level, rng: Rng): void {
  for (const card of shop.slots) {
    if (card !== null) returnToPool(pool, card);
  }
  shop.slots = shop.slots.map(() => null);
  shop.slots = shop.slots.map(() => drawCard(pool, level, rng));
}

/**
 * Round-start shop: a fresh free roll unless the shop was locked. The lock
 * lasts one round, so it is always cleared here.
 */
export function startRoundShop(pool: Pool, shop: ShopState, level: Level, rng: Rng): void {
  if (!shop.locked) rollShop(pool, shop, level, rng);
  shop.locked = false;
}

/** Paid reroll. Returns false (and changes nothing) when the wallet is short. */
export function reroll(
  pool: Pool,
  shop: ShopState,
  wallet: Wallet,
  level: Level,
  rng: Rng,
): boolean {
  if (wallet.gold < ECONOMY.rerollCost) return false;
  wallet.gold -= ECONOMY.rerollCost;
  rollShop(pool, shop, level, rng);
  shop.locked = false;
  return true;
}

export function toggleLock(shop: ShopState): void {
  shop.locked = !shop.locked;
}

/** Take the card out of a slot (the buy itself lives with the bench logic). */
export function takeCard(shop: ShopState, slot: number): PieceType | null {
  const card = shop.slots[slot] ?? null;
  if (card !== null) shop.slots[slot] = null;
  return card;
}

// ---------------------------------------------------------------------------
// Owned pieces: bench, board, buying, selling, merging
// ---------------------------------------------------------------------------

/** A piece a player owns, on the bench or on the board. */
export interface OwnedPiece {
  readonly id: number;
  readonly type: PieceType;
  stars: StarLevel;
}

/** An owned piece standing on its player's board (world coordinates). */
export interface PlacedPiece extends OwnedPiece {
  x: number;
  y: number;
}

/** Everything a player owns; gold lives in the player's wallet (Economy). */
export interface Holdings {
  /** Bench slots; null when empty. */
  bench: (OwnedPiece | null)[];
  board: PlacedPiece[];
  /** Next piece id to hand out. */
  nextId: number;
}

export type BuyResult = 'ok' | 'empty-slot' | 'gold' | 'bench-full';

export function createHoldings(): Holdings {
  return {
    bench: Array.from({ length: PLAYER.benchSize }, () => null),
    board: [],
    nextId: 1,
  };
}

/** Every piece owned, board first (a board copy is the preferred merge survivor). */
function ownedPieces(holdings: Holdings): OwnedPiece[] {
  return [...holdings.board, ...holdings.bench.filter((p): p is OwnedPiece => p !== null)];
}

/** How many pieces of a type and star level the player owns. */
export function countOwned(holdings: Holdings, type: PieceType, stars: StarLevel): number {
  return ownedPieces(holdings).filter((p) => p.type === type && p.stars === stars).length;
}

/**
 * Merge every set of 3 same-type, same-star pieces into one piece a star
 * higher, chaining up to 3★. The survivor stays where a copy stood, preferring
 * a board copy. `extra` is a piece that has no bench slot yet (a full-bench
 * merge buy); it is only ever consumed, never kept. Returns pieces upgraded.
 */
export function mergeAll(holdings: Holdings, extra: OwnedPiece | null = null): OwnedPiece[] {
  const upgraded: OwnedPiece[] = [];
  let leftover = extra;
  for (let merged = true; merged;) {
    merged = false;
    const pool: OwnedPiece[] = [...ownedPieces(holdings), ...(leftover ? [leftover] : [])];
    for (const type of PIECE_ORDER) {
      for (const stars of [1, 2] as const) {
        const same = pool.filter((p) => p.type === type && p.stars === stars);
        if (same.length < MERGE_COUNT) continue;
        const [keep, ...consumed] = same.slice(0, MERGE_COUNT);
        if (keep === undefined) continue;
        for (const gone of consumed) {
          if (gone === leftover) leftover = null;
          holdings.board = holdings.board.filter((p) => p !== gone);
          holdings.bench = holdings.bench.map((p) => (p === gone ? null : p));
        }
        keep.stars = (stars + 1) as StarLevel;
        upgraded.push(keep);
        merged = true;
        break;
      }
      if (merged) break;
    }
  }
  return upgraded;
}

/** Can the player take another copy: a free bench slot, or the buy completes a merge. */
export function canTake(holdings: Holdings, type: PieceType): boolean {
  return holdings.bench.includes(null) || countOwned(holdings, type, 1) >= MERGE_COUNT - 1;
}

/** Buy the card in a shop slot: pays its cost, benches it and merges. */
export function buy(shop: ShopState, holdings: Holdings, wallet: Wallet, slot: number): BuyResult {
  const type = shop.slots[slot] ?? null;
  if (type === null) return 'empty-slot';
  if (wallet.gold < PIECES[type].cost) return 'gold';
  if (!canTake(holdings, type)) return 'bench-full';
  takeCard(shop, slot);
  wallet.gold -= PIECES[type].cost;
  const piece: OwnedPiece = { id: holdings.nextId, type, stars: 1 };
  holdings.nextId += 1;
  const free = holdings.bench.indexOf(null);
  if (free >= 0) {
    holdings.bench[free] = piece;
    mergeAll(holdings);
  } else {
    mergeAll(holdings, piece);
  }
  return 'ok';
}

/**
 * Sell a piece by id from the bench or board: refunds cost × 3^(stars−1) gold
 * and returns that many copies to the pool. Returns the refund, or null if the
 * piece is not owned.
 */
export function sell(pool: Pool, holdings: Holdings, wallet: Wallet, id: number): number | null {
  const piece = ownedPieces(holdings).find((p) => p.id === id);
  if (piece === undefined) return null;
  holdings.board = holdings.board.filter((p) => p !== piece);
  holdings.bench = holdings.bench.map((p) => (p === piece ? null : p));
  const refund = sellValue(piece.type, piece.stars);
  wallet.gold += refund;
  returnToPool(pool, piece.type, copiesForStars(piece.stars));
  return refund;
}
