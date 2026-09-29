/**
 * Shared piece pool and shop rolling (spec §3.4).
 *
 * The pool is shared by both players. Cards sitting in a shop are out of the
 * pool; unbought cards go back on reroll. Piece counts are conserved: every
 * copy is in the pool, a shop slot, or a player's hands (bench / board).
 */
import { ECONOMY, PIECES, PIECE_ORDER, PLAYER, POOL_SIZE, TIER_ODDS } from './data.ts';
import { int } from './rng.ts';
import type { Rng } from './rng.ts';
import type { Level, PieceType, Tier } from './types.ts';

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
