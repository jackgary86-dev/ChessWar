import { describe, expect, it } from 'vitest';

import { PIECES, PIECE_ORDER, PLAYER, copiesForStars, sellValue } from '@sim/data.ts';
import { createRng } from '@sim/rng.ts';
import {
  buy,
  canTake,
  countOwned,
  createHoldings,
  createPool,
  createShop,
  mergeAll,
  poolTotal,
  reroll,
  sell,
} from '@sim/shop.ts';
import type { Holdings, Pool, ShopState } from '@sim/shop.ts';
import type { PieceType, StarLevel } from '@sim/types.ts';

const SEED = 9;
const RICH = 1_000_000;
const TOTAL_COPIES = PIECE_ORDER.reduce((sum, type) => sum + createPool()[type], 0);

/** Put a specific card in slot 0, taking it from the pool like a real roll would. */
function stock(pool: Pool, shop: ShopState, type: PieceType): void {
  const old = shop.slots[0];
  if (old) pool[old] += 1;
  pool[type] -= 1;
  shop.slots[0] = type;
}

function buyType(pool: Pool, shop: ShopState, holdings: Holdings, type: PieceType): string {
  stock(pool, shop, type);
  return buy(shop, holdings, 0);
}

function pieces(holdings: Holdings): { type: PieceType; stars: StarLevel }[] {
  return [
    ...holdings.board,
    ...holdings.bench.filter((p): p is NonNullable<typeof p> => p !== null),
  ];
}

function setup(): { pool: Pool; shop: ShopState; holdings: Holdings } {
  return { pool: createPool(), shop: createShop(), holdings: createHoldings(RICH) };
}

describe('buying', () => {
  it('pays the cost and puts the piece on the bench', () => {
    const { pool, shop, holdings } = setup();
    expect(buyType(pool, shop, holdings, 'N')).toBe('ok');
    expect(holdings.gold).toBe(RICH - PIECES.N.cost);
    expect(holdings.bench[0]).toMatchObject({ type: 'N', stars: 1 });
    expect(shop.slots[0]).toBeNull();
  });

  it('refuses when short of gold, on an empty slot, and changes nothing', () => {
    const { pool, shop, holdings } = setup();
    holdings.gold = PIECES.Q.cost - 1;
    expect(buyType(pool, shop, holdings, 'Q')).toBe('gold');
    expect(shop.slots[0]).toBe('Q');
    expect(holdings.bench.every((p) => p === null)).toBe(true);
    expect(buy(shop, holdings, 1)).toBe('empty-slot');
  });

  it('a full bench blocks a buy that does not complete a merge', () => {
    const { pool, shop, holdings } = setup();
    for (let i = 0; i < PLAYER.benchSize; i++) {
      // Alternate types so nothing merges: at most 2 of any type on the bench.
      const type = PIECE_ORDER[i % 4] ?? 'P';
      expect(buyType(pool, shop, holdings, type)).toBe('ok');
    }
    expect(holdings.bench.every((p) => p !== null)).toBe(true);
    expect(canTake(holdings, 'Q')).toBe(false);
    expect(buyType(pool, shop, holdings, 'Q')).toBe('bench-full');
  });

  it('a full bench still allows a buy that completes a merge', () => {
    const { pool, shop, holdings } = setup();
    // Two pawns plus six other pieces fill the bench (no type reaches 3).
    const order: PieceType[] = ['P', 'P', 'N', 'N', 'B', 'B', 'R', 'R'];
    for (const type of order) buyType(pool, shop, holdings, type);
    expect(holdings.bench.every((p) => p !== null)).toBe(true);
    expect(buyType(pool, shop, holdings, 'P')).toBe('ok');
    expect(countOwned(holdings, 'P', 2)).toBe(1);
    expect(countOwned(holdings, 'P', 1)).toBe(0);
    // The 2★ takes a pawn's slot; the other benched pawn's slot is freed.
    expect(holdings.bench.filter((p) => p === null)).toHaveLength(1);
  });
});

describe('merging', () => {
  it('3×1★ becomes one 2★', () => {
    const { pool, shop, holdings } = setup();
    for (let i = 0; i < 3; i++) buyType(pool, shop, holdings, 'B');
    expect(pieces(holdings)).toEqual([expect.objectContaining({ type: 'B', stars: 2 })]);
  });

  it('9×1★ bought in sequence becomes one 3★', () => {
    const { pool, shop, holdings } = setup();
    for (let i = 0; i < 9; i++) expect(buyType(pool, shop, holdings, 'P')).toBe('ok');
    expect(pieces(holdings)).toEqual([expect.objectContaining({ type: 'P', stars: 3 })]);
  });

  it('never merges 3★ pieces further or mixes types and stars', () => {
    const { pool, shop, holdings } = setup();
    for (let i = 0; i < 2; i++) buyType(pool, shop, holdings, 'P');
    for (let i = 0; i < 2; i++) buyType(pool, shop, holdings, 'N');
    expect(pieces(holdings)).toHaveLength(4);
    expect(mergeAll(holdings)).toEqual([]);
  });

  it('a merged piece keeps the board square of a board copy', () => {
    const { pool, shop, holdings } = setup();
    buyType(pool, shop, holdings, 'R');
    buyType(pool, shop, holdings, 'R');
    // Move one rook from the bench to the board at (3, 4).
    const [first] = holdings.bench;
    if (!first) throw new Error('expected a benched rook');
    holdings.bench[0] = null;
    holdings.board.push({ ...first, x: 3, y: 4 });
    buyType(pool, shop, holdings, 'R');
    expect(holdings.board).toHaveLength(1);
    expect(holdings.board[0]).toMatchObject({ type: 'R', stars: 2, x: 3, y: 4 });
    expect(holdings.bench.every((p) => p === null)).toBe(true);
  });

  it('chains a merge into a higher merge when the survivor completes another set', () => {
    const { pool, shop, holdings } = setup();
    for (let i = 0; i < 8; i++) buyType(pool, shop, holdings, 'P'); // 2×2★ + 2×1★
    expect(countOwned(holdings, 'P', 2)).toBe(2);
    expect(countOwned(holdings, 'P', 1)).toBe(2);
    buyType(pool, shop, holdings, 'P');
    expect(pieces(holdings)).toEqual([expect.objectContaining({ stars: 3 })]);
  });
});

describe('selling', () => {
  it('refunds cost × 3^(stars−1) and returns that many copies to the pool', () => {
    const { pool, shop, holdings } = setup();
    for (let i = 0; i < 3; i++) buyType(pool, shop, holdings, 'N');
    const before = poolTotal(pool);
    const gold = holdings.gold;
    const piece = pieces(holdings)[0];
    const id = holdings.bench.find((p) => p !== null)?.id ?? -1;
    expect(piece?.stars).toBe(2);
    expect(sell(pool, holdings, id)).toBe(sellValue('N', 2));
    expect(holdings.gold).toBe(gold + PIECES.N.cost * copiesForStars(2));
    expect(poolTotal(pool)).toBe(before + copiesForStars(2));
    expect(pieces(holdings)).toHaveLength(0);
  });

  it('returns null for a piece it does not own', () => {
    const { pool, holdings } = setup();
    expect(sell(pool, holdings, 12345)).toBeNull();
  });
});

describe('piece conservation with buying and merging', () => {
  it('pool + shop + hands stay constant through buys, merges, sells and rerolls', () => {
    const rng = createRng(SEED);
    const { pool, shop, holdings } = setup();
    const total = (): number =>
      poolTotal(pool) +
      shop.slots.filter((c) => c !== null).length +
      pieces(holdings).reduce((sum, p) => sum + copiesForStars(p.stars), 0);
    reroll(pool, shop, holdings, 2, rng);
    expect(total()).toBe(TOTAL_COPIES);
    for (let step = 0; step < 400; step++) {
      if (step % 5 === 4) {
        const victim = holdings.bench.find((p) => p !== null);
        if (victim) sell(pool, holdings, victim.id);
      } else {
        reroll(pool, shop, holdings, 2, rng);
        for (let slot = 0; slot < PLAYER.shopSize; slot++) buy(shop, holdings, slot);
      }
      expect(total()).toBe(TOTAL_COPIES);
    }
  });
});
