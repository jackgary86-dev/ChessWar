import { describe, expect, it } from 'vitest';

import { parseSquare } from '@sim/board.ts';
import { createBattle, stepBattle } from '@sim/battle.ts';
import type { ArmyPiece, BattleEvent, BattleState } from '@sim/battle.ts';
import { ABILITY, BATTLE, unitAtk } from '@sim/data.ts';
import { createRng } from '@sim/rng.ts';
import type { PieceType, StarLevel } from '@sim/types.ts';

const SEED = 3;
/** Keeps a unit from acting during a single-tick scenario. */
const IDLE_COOLDOWN = 99;
const STARS: readonly StarLevel[] = [1, 2, 3];

function piece(type: PieceType, square: string, stars: StarLevel = 1): ArmyPiece {
  return { type, stars, pos: parseSquare(square) };
}

/** Only unit 0 acts, once. Returns the battle after that single tick. */
function actOnce(pieces: ArmyPiece[], tweak?: (state: BattleState) => void): BattleState {
  const state = createBattle(pieces, createRng(SEED));
  for (const u of state.units) u.cooldown = u.id === 0 ? 1 : IDLE_COOLDOWN;
  tweak?.(state);
  stepBattle(state);
  return state;
}

type StrikeEvent = Extract<BattleEvent, { kind: 'strike' }>;
type HealEvent = Extract<BattleEvent, { kind: 'heal' }>;

const strikes = (s: BattleState): StrikeEvent[] =>
  s.events.filter((e): e is StrikeEvent => e.kind === 'strike');
const heals = (s: BattleState): HealEvent[] =>
  s.events.filter((e): e is HealEvent => e.kind === 'heal');

function expectedDamage(atk: number, mult: number, armor: number): number {
  return Math.max(BATTLE.minDamage, Math.round(atk * mult * (1 - armor)));
}

describe('Pawn Shield Wall', () => {
  // A knight on g4 hits the pawn on i5; a friend on i4 is orthogonally adjacent.
  const armorFor = (stars: StarLevel): number =>
    stars === 1 ? 0 : ABILITY.shieldWallReduction[stars];

  for (const stars of STARS) {
    it(`${String(stars)}★ pawn with a friend beside it`, () => {
      const state = actOnce([piece('N', 'g4'), piece('P', 'i5', stars), piece('R', 'i4')]);
      expect(strikes(state)[0]?.damage).toBe(expectedDamage(unitAtk('N', 1), 1, armorFor(stars)));
    });
  }

  it('does nothing without an orthogonally adjacent friend', () => {
    // The friend is only diagonal.
    const state = actOnce([piece('N', 'g4'), piece('P', 'i5', 3), piece('R', 'j4')]);
    expect(strikes(state)[0]?.damage).toBe(unitAtk('N', 1));
  });
});

describe('Rook Fortress', () => {
  for (const stars of STARS) {
    it(`${String(stars)}★ rook takes ${stars === 1 ? 'full' : 'reduced'} damage`, () => {
      const state = actOnce([piece('N', 'g4'), piece('R', 'i5', stars)]);
      const armor = stars === 1 ? 0 : ABILITY.fortressReduction[stars];
      expect(strikes(state)[0]?.damage).toBe(expectedDamage(unitAtk('N', 1), 1, armor));
    });
  }
});

describe('Knight Fork', () => {
  // A knight on h6 sees four enemy pawns on i4, j5, j7 and i8.
  const enemies = ['i4', 'j5', 'j7', 'i8'].map((sq) => piece('P', sq));
  const expectedHits: Record<StarLevel, number> = { 1: 1, 2: 2, 3: enemies.length };

  for (const stars of STARS) {
    it(`${String(stars)}★ knight hits ${String(expectedHits[stars])} enemies`, () => {
      const state = actOnce([piece('N', 'h6', stars), ...enemies]);
      const hits = strikes(state);
      expect(hits).toHaveLength(expectedHits[stars]);
      expect(new Set(hits.map((h) => h.target)).size).toBe(hits.length);
      expect(hits[0]?.via).toBe('strike');
      for (const extra of hits.slice(1)) expect(extra.via).toBe('fork');
    });
  }
});

describe('Bishop Blessing', () => {
  // The bishop on h6 strikes the pawn on i5 and heals a wounded rook on a1.
  const wound = 300;
  const setup = (stars: StarLevel, missing = wound): BattleState =>
    actOnce([piece('B', 'h6', stars), piece('P', 'i5'), piece('R', 'a1')], (s) => {
      const rook = s.units[2];
      if (rook) rook.hp = rook.maxHp - missing;
    });

  it('is off at 1★', () => {
    expect(heals(setup(1))).toHaveLength(0);
  });

  for (const stars of [2, 3] as const) {
    it(`${String(stars)}★ heals the most wounded ally for ${String(ABILITY.blessingHealRatio[stars] * 100)}% ATK`, () => {
      const state = setup(stars);
      const [heal] = heals(state);
      expect(heal).toMatchObject({ healer: 0, target: 2 });
      expect(heal?.amount).toBe(Math.round(unitAtk('B', stars) * ABILITY.blessingHealRatio[stars]));
      expect(state.units[2]?.hp).toBe((state.units[2]?.maxHp ?? 0) - wound + (heal?.amount ?? 0));
    });
  }

  it('never heals above max HP', () => {
    const state = setup(3, 5);
    expect(heals(state)[0]?.amount).toBe(5);
    expect(state.units[2]?.hp).toBe(state.units[2]?.maxHp);
  });

  it('does not heal when nobody is wounded', () => {
    const state = actOnce([piece('B', 'h6', 2), piece('P', 'i5'), piece('R', 'a1')]);
    expect(heals(state)).toHaveLength(0);
  });
});

describe('Queen Pierce', () => {
  // The queen on h6 strikes a pawn on i6 (lowest HP); a rook stands behind it on j6.
  const pierced = (stars: StarLevel, rearSquare = 'j6'): BattleState =>
    actOnce([piece('Q', 'h6', stars), piece('P', 'i6'), piece('R', rearSquare)]);

  it('is off at 1★', () => {
    expect(strikes(pierced(1))).toHaveLength(1);
  });

  for (const stars of [2, 3] as const) {
    it(`${String(stars)}★ also hits the enemy behind the target for ${String(ABILITY.pierceRatio[stars] * 100)}%`, () => {
      const hits = strikes(pierced(stars));
      expect(hits).toHaveLength(2);
      expect(hits[1]).toMatchObject({ target: 2, via: 'pierce' });
      // The 1★ rook has no armor, so the pierce is a plain fraction of ATK.
      expect(hits[1]?.damage).toBe(
        expectedDamage(unitAtk('Q', stars), ABILITY.pierceRatio[stars], 0),
      );
    });
  }

  it('does not pierce into empty space', () => {
    const state = actOnce([piece('Q', 'h6', 3), piece('P', 'i6')]);
    expect(strikes(state)).toHaveLength(1);
  });
});
