import { describe, expect, it } from 'vitest';

import {
  PIECES,
  PIECE_ORDER,
  PLAYER,
  POOL_SIZE,
  TIER_ODDS,
  ECONOMY,
  copiesForStars,
} from '@sim/data.ts';
import { createRng } from '@sim/rng.ts';
import {
  createPool,
  createShop,
  poolTotal,
  reroll,
  returnToPool,
  rollShop,
  startRoundShop,
  takeCard,
  toggleLock,
} from '@sim/shop.ts';
import type { Pool, ShopState } from '@sim/shop.ts';
import type { Level, PieceType, StarLevel } from '@sim/types.ts';

const SEED = 5;
const LEVELS: readonly Level[] = [2, 3, 4, 5, 6, 7, 8];
const SAMPLE_ROLLS = 4000;
const TOTAL_COPIES = PIECE_ORDER.reduce((sum, type) => sum + POOL_SIZE[type], 0);

function shopCards(shop: ShopState): PieceType[] {
  return shop.slots.filter((c): c is PieceType => c !== null);
}

describe('pool', () => {
  it('starts at the spec sizes and is a copy of the data', () => {
    const pool = createPool();
    expect(pool).toEqual({ P: 30, N: 18, B: 18, R: 14, Q: 9 });
    pool.P = 0;
    expect(POOL_SIZE.P).toBe(30);
  });
});

describe('shop rolling', () => {
  it('deals a full shop of pool-backed cards', () => {
    const pool = createPool();
    const shop = createShop();
    rollShop(pool, shop, 5, createRng(SEED));
    expect(shop.slots).toHaveLength(PLAYER.shopSize);
    expect(shopCards(shop)).toHaveLength(PLAYER.shopSize);
    expect(poolTotal(pool)).toBe(TOTAL_COPIES - PLAYER.shopSize);
  });

  it('only offers tier 1 and 2 pieces at level 2 and follows the odds', () => {
    const rng = createRng(SEED);
    for (const level of LEVELS) {
      const counts: number[] = [0, 0, 0, 0];
      for (let i = 0; i < SAMPLE_ROLLS; i++) {
        const pool = createPool();
        const shop = createShop();
        rollShop(pool, shop, level, rng);
        for (const card of shopCards(shop)) {
          const idx = PIECES[card].tier - 1;
          counts[idx] = (counts[idx] ?? 0) + 1;
        }
      }
      const total = counts.reduce((a, b) => a + b, 0);
      TIER_ODDS[level].forEach((pct, i) => {
        if (pct === 0) expect(counts[i]).toBe(0);
        else expect(Math.abs((counts[i] ?? 0) / total - pct / 100)).toBeLessThan(0.05);
      });
    }
  });

  it('falls back to the nearest tier with stock when a tier is empty', () => {
    const pool = createPool();
    pool.P = 0; // tier 1 empty
    const shop = createShop();
    rollShop(pool, shop, 2, createRng(SEED)); // level 2 rolls tier 1 70% of the time
    expect(shopCards(shop)).toHaveLength(PLAYER.shopSize);
    for (const card of shopCards(shop)) expect(PIECES[card].tier).toBe(2);
  });

  it('gives an empty slot when the pool is exhausted', () => {
    const pool: Pool = { P: 0, N: 0, B: 0, R: 0, Q: 0 };
    const shop = createShop();
    rollShop(pool, shop, 8, createRng(SEED));
    expect(shopCards(shop)).toHaveLength(0);
  });

  it('is deterministic for a seed', () => {
    const roll = (): (PieceType | null)[] => {
      const shop = createShop();
      rollShop(createPool(), shop, 6, createRng(SEED));
      return shop.slots;
    };
    expect(roll()).toEqual(roll());
  });
});

describe('reroll, free roll and lock', () => {
  it('a paid reroll costs gold and returns unbought cards to the pool', () => {
    const pool = createPool();
    const shop = createShop();
    const rng = createRng(SEED);
    rollShop(pool, shop, 4, rng);
    const wallet = { gold: 5 };
    expect(reroll(pool, shop, wallet, 4, rng)).toBe(true);
    expect(wallet.gold).toBe(5 - ECONOMY.rerollCost);
    expect(poolTotal(pool)).toBe(TOTAL_COPIES - PLAYER.shopSize);
  });

  it('refuses to reroll without enough gold', () => {
    const pool = createPool();
    const shop = createShop();
    const wallet = { gold: ECONOMY.rerollCost - 1 };
    expect(reroll(pool, shop, wallet, 4, createRng(SEED))).toBe(false);
    expect(wallet.gold).toBe(ECONOMY.rerollCost - 1);
    expect(poolTotal(pool)).toBe(TOTAL_COPIES);
  });

  it('the round-start roll is free, and a lock keeps the shop for one round only', () => {
    const pool = createPool();
    const shop = createShop();
    const rng = createRng(SEED);
    startRoundShop(pool, shop, 4, rng);
    const kept = [...shop.slots];
    toggleLock(shop);
    startRoundShop(pool, shop, 4, rng);
    expect(shop.slots).toEqual(kept);
    expect(shop.locked).toBe(false);
    // The lock lasted one round: the next round-start roll deals fresh cards.
    let changed = false;
    for (let round = 0; round < 10 && !changed; round++) {
      startRoundShop(pool, shop, 4, rng);
      changed = JSON.stringify(shop.slots) !== JSON.stringify(kept);
    }
    expect(changed).toBe(true);
  });

  it('a manual reroll clears the lock', () => {
    const pool = createPool();
    const shop = createShop();
    const rng = createRng(SEED);
    rollShop(pool, shop, 4, rng);
    toggleLock(shop);
    reroll(pool, shop, { gold: 9 }, 4, rng);
    expect(shop.locked).toBe(false);
  });
});

describe('piece conservation', () => {
  it('pool + shops + hands stay constant across buy, sell and reroll', () => {
    const rng = createRng(SEED);
    const pool = createPool();
    const shops = [createShop(), createShop()];
    const hands: { type: PieceType; stars: StarLevel }[] = [];
    const wallet = { gold: 1_000_000 };
    const total = (): number =>
      poolTotal(pool) +
      shops.reduce((sum, s) => sum + shopCards(s).length, 0) +
      hands.reduce((sum, h) => sum + copiesForStars(h.stars), 0);

    expect(total()).toBe(TOTAL_COPIES);
    for (let step = 0; step < 300; step++) {
      const shop = shops[step % shops.length] ?? createShop();
      const level = LEVELS[step % LEVELS.length] ?? 2;
      const action = step % 3;
      if (action === 0) reroll(pool, shop, wallet, level, rng);
      else if (action === 1) {
        const card = takeCard(shop, step % PLAYER.shopSize);
        if (card !== null) hands.push({ type: card, stars: 1 });
      } else {
        const sold = hands.pop();
        if (sold) returnToPool(pool, sold.type, copiesForStars(sold.stars));
      }
      expect(total()).toBe(TOTAL_COPIES);
    }
  });
});
