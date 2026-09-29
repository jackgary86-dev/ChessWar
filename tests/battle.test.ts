import { describe, expect, it } from 'vitest';

import { parseSquare } from '@sim/board.ts';
import { createBattle, runBattle, stepBattle } from '@sim/battle.ts';
import type { ArmyPiece } from '@sim/battle.ts';
import { BATTLE, PIECES, unitAtk, unitHp } from '@sim/data.ts';
import { createRng } from '@sim/rng.ts';
import type { PieceType, StarLevel } from '@sim/types.ts';

const SEED = 7;
/** Keeps a unit from acting during a single-tick scenario. */
const IDLE_COOLDOWN = 99;

function piece(type: PieceType, square: string, stars: StarLevel = 1): ArmyPiece {
  return { type, stars, pos: parseSquare(square) };
}

describe('createBattle', () => {
  it('builds star-scaled units and assigns sides by board half', () => {
    const state = createBattle([piece('R', 'a1', 2), piece('N', 'p8')], createRng(SEED));
    const [rook, knight] = state.units;
    expect(rook?.side).toBe(0);
    expect(knight?.side).toBe(1);
    expect(rook?.hp).toBe(unitHp('R', 2));
    expect(rook?.atk).toBe(unitAtk('R', 2));
  });

  it('first action lands on a random tick between 1 and speed', () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = createBattle([piece('R', 'a1'), piece('P', 'p8')], createRng(seed));
      for (const u of state.units) {
        expect(u.cooldown).toBeGreaterThanOrEqual(1);
        expect(u.cooldown).toBeLessThanOrEqual(PIECES[u.type].speed);
      }
    }
  });

  it('rejects duplicate or off-board squares', () => {
    expect(() => createBattle([piece('P', 'a1'), piece('N', 'a1')], createRng(SEED))).toThrow(
      RangeError,
    );
  });

  it('is finished immediately when a side is empty', () => {
    const state = createBattle([piece('P', 'a1')], createRng(SEED));
    expect(state.finished).toBe(true);
    expect(state.winner).toBe(0);
  });
});

describe('combat rules', () => {
  it('strikes for round(ATK) and the attacker moves onto a killed target', () => {
    // A knight finishes off a wounded pawn; the knight then stands on its square.
    const state = createBattle([piece('N', 'g4', 3), piece('P', 'i5')], createRng(SEED));
    const [knight, pawn] = state.units;
    if (knight && pawn) {
      knight.cooldown = 1;
      pawn.cooldown = IDLE_COOLDOWN;
      pawn.hp = 1;
    }
    stepBattle(state);
    const strike = state.events.find((e) => e.kind === 'strike');
    expect(strike).toMatchObject({ damage: unitAtk('N', 3) });
    const death = state.events.find((e) => e.kind === 'death');
    expect(death).toMatchObject({ unit: 1 });
    const moveAfter = state.events.find((e) => e.kind === 'move');
    expect(moveAfter).toMatchObject({ unit: 0, to: parseSquare('i5') });
    expect(state.winner).toBe(0);
  });

  it('deals at least the minimum damage and never negative HP', () => {
    const state = runBattle([piece('Q', 'e4', 3), piece('P', 'f4')], createRng(SEED));
    for (const u of state.units) expect(u.hp).toBeGreaterThanOrEqual(0);
    const strikes = state.events.filter((e) => e.kind === 'strike');
    for (const s of strikes) expect(s.damage).toBeGreaterThanOrEqual(BATTLE.minDamage);
  });

  it('strikes the lowest-HP enemy in range', () => {
    // The queen sees a rook (780 HP) on i6 and a pawn (380 HP) on i5.
    const state = createBattle(
      [piece('Q', 'h6'), piece('R', 'i6'), piece('P', 'i5')],
      createRng(SEED),
    );
    const [queen] = state.units;
    if (queen) queen.cooldown = 1;
    stepBattle(state);
    const first = state.events.find((e) => e.kind === 'strike' && e.attacker === 0);
    expect(first).toMatchObject({ target: 2 });
  });

  it('emits a portal event when a piece crosses the wall', () => {
    const state = runBattle([piece('R', 'f6'), piece('P', 'p6')], createRng(SEED));
    expect(state.events.some((e) => e.kind === 'portal')).toBe(true);
  });

  it('never lets a piece cross the wall away from a portal', () => {
    const state = runBattle([piece('R', 'f5'), piece('B', 'm5')], createRng(SEED));
    const crossings = state.events.filter((e) => e.kind === 'portal');
    for (const e of crossings) {
      const { from, to } = e;
      expect(from.x <= 7 ? to.x >= 8 : to.x <= 7).toBe(true);
    }
  });
});

describe('determinism', () => {
  const armies: ArmyPiece[] = [
    piece('P', 'c3'),
    piece('N', 'd2'),
    piece('B', 'b1'),
    piece('R', 'a4', 2),
    piece('Q', 'b6'),
    piece('P', 'n3'),
    piece('N', 'm2'),
    piece('B', 'o1'),
    piece('R', 'p4', 2),
    piece('Q', 'o6'),
  ];

  it('same seed and armies give an identical event log', () => {
    const a = runBattle(armies, createRng(SEED));
    const b = runBattle(armies, createRng(SEED));
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.events).toEqual(b.events);
    expect(a.tick).toBe(b.tick);
    expect(a.winner).toBe(b.winner);
  });

  it('different seeds can give different battles', () => {
    const logs = new Set(
      Array.from({ length: 8 }, (_, seed) =>
        JSON.stringify(runBattle(armies, createRng(seed)).events),
      ),
    );
    expect(logs.size).toBeGreaterThan(1);
  });

  it('stops at the tick cap and stepBattle is a no-op after the end', () => {
    const state = runBattle(armies, createRng(SEED));
    expect(state.tick).toBeLessThanOrEqual(BATTLE.maxTicks);
    const events = state.events.length;
    stepBattle(state);
    expect(state.events).toHaveLength(events);
  });
});
