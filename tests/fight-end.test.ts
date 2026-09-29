import { describe, expect, it } from 'vitest';

import { parseSquare } from '@sim/board.ts';
import { createBattle, material, runBattle } from '@sim/battle.ts';
import type { ArmyPiece } from '@sim/battle.ts';
import { BATTLE, PIECE_ORDER, PIECES } from '@sim/data.ts';
import { createRng, int } from '@sim/rng.ts';
import type { PieceType, Side, StarLevel } from '@sim/types.ts';

const SEED = 11;
const FUZZ_BATTLES = 1000;
const MAX_PER_SIDE = 8;
const FILES_PER_SIDE = 8;
const RANKS = 8;
const MAX_STARS = 3;
const FUZZ_TIMEOUT_MS = 60_000;

function piece(type: PieceType, square: string, stars: StarLevel = 1): ArmyPiece {
  return { type, stars, pos: parseSquare(square) };
}

describe('end conditions', () => {
  it('ends by elimination when one side is wiped out', () => {
    const state = runBattle([piece('Q', 'h6', 3), piece('P', 'i6')], createRng(SEED));
    expect(state.endReason).toBe('elimination');
    expect(state.winner).toBe(0);
  });

  // Bishops on opposite square colours can never strike each other.
  it('ends after the idle limit with no damage and the richer side wins', () => {
    const state = runBattle([piece('B', 'a1', 2), piece('B', 'p1')], createRng(SEED));
    expect(state.endReason).toBe('idle');
    expect(state.tick).toBe(BATTLE.idleTickLimit);
    expect(state.winner).toBe(0);
    const weaker = runBattle([piece('B', 'a1'), piece('B', 'p1', 2)], createRng(SEED));
    expect(weaker.winner).toBe(1);
  });

  it('an exact material tie is a draw', () => {
    const state = runBattle([piece('B', 'a1'), piece('B', 'p1')], createRng(SEED));
    expect(state.endReason).toBe('idle');
    expect(state.finished).toBe(true);
    expect(state.winner).toBeNull();
  });

  it('counts material as cost × 3^(stars−1) × hp/maxHp', () => {
    const state = createBattle(
      [piece('R', 'a1', 2), piece('P', 'b1'), piece('Q', 'p8')],
      createRng(SEED),
    );
    const [rook, pawn] = state.units;
    if (rook) rook.hp = rook.maxHp / 2;
    const expected = PIECES.R.cost * 3 * 0.5 + PIECES.P.cost;
    expect(material(state.units, 0)).toBeCloseTo(expected, 10);
    expect(pawn?.hp).toBe(pawn?.maxHp);
    expect(material(state.units, 1)).toBe(PIECES.Q.cost);
  });
});

function randomArmy(rng: ReturnType<typeof createRng>, side: Side): ArmyPiece[] {
  const count = 1 + int(rng, MAX_PER_SIDE);
  const taken = new Set<string>();
  const army: ArmyPiece[] = [];
  while (army.length < count) {
    const x = int(rng, FILES_PER_SIDE) + (side === 0 ? 0 : FILES_PER_SIDE);
    const y = int(rng, RANKS);
    const key = `${String(x)},${String(y)}`;
    if (taken.has(key)) continue;
    taken.add(key);
    army.push({
      type: PIECE_ORDER[int(rng, PIECE_ORDER.length)] ?? 'P',
      stars: (1 + int(rng, MAX_STARS)) as StarLevel,
      pos: { x, y },
    });
  }
  return army;
}

describe('fuzz', () => {
  it(
    `ends within ${String(BATTLE.maxTicks)} ticks in ${String(FUZZ_BATTLES)} random battles`,
    () => {
      const gen = createRng(SEED);
      for (let i = 0; i < FUZZ_BATTLES; i++) {
        const armies = [...randomArmy(gen, 0), ...randomArmy(gen, 1)];
        const state = runBattle(armies, createRng(i));
        expect(state.finished).toBe(true);
        expect(state.tick).toBeLessThanOrEqual(BATTLE.maxTicks);
        expect(state.endReason).not.toBeNull();
        for (const u of state.units) {
          expect(u.hp).toBeGreaterThanOrEqual(0);
          expect(u.hp).toBeLessThanOrEqual(u.maxHp);
        }
      }
    },
    FUZZ_TIMEOUT_MS,
  );
});
