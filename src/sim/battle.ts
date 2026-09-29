/**
 * Tick-based combat simulation (spec §3.3).
 *
 * Pure and deterministic: all randomness comes from the seeded RNG carried in
 * the battle state, so the same seed and armies give an identical event log.
 *
 * Each tick, every living unit is processed in a seeded shuffled order. A unit
 * acts when its cooldown runs out: it strikes the lowest-HP enemy in its strike
 * pattern (moving onto the square on a kill), otherwise it steps along the
 * path from `pathfinding.ts`, otherwise it waits one tick.
 *
 * Star abilities (#9) and the idle / material end conditions (#10) build on
 * this loop. Here a battle ends when one side is wiped out, or at the hard
 * `BATTLE.maxTicks` cap.
 */
import { generateStrikes, sideOfX, squareName } from './board.ts';
import type { Pos } from './board.ts';
import { BATTLE, BOARD, PIECES, unitAtk, unitHp } from './data.ts';
import { findStep } from './pathfinding.ts';
import { int, shuffle } from './rng.ts';
import type { Rng } from './rng.ts';
import type { PieceType, Side, StarLevel } from './types.ts';

/** A piece placed on a board before the fight. `pos` is in world coordinates. */
export interface ArmyPiece {
  readonly type: PieceType;
  readonly stars: StarLevel;
  readonly pos: Pos;
}

export interface BattleUnit {
  readonly id: number;
  readonly type: PieceType;
  readonly stars: StarLevel;
  readonly side: Side;
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  readonly atk: number;
  /** Ticks until this unit next acts. */
  cooldown: number;
}

export type BattleEvent =
  | {
      readonly kind: 'move';
      readonly tick: number;
      readonly unit: number;
      readonly from: Pos;
      readonly to: Pos;
    }
  | {
      /** A non-knight move that crossed the wall through a portal. */
      readonly kind: 'portal';
      readonly tick: number;
      readonly unit: number;
      readonly from: Pos;
      readonly to: Pos;
    }
  | {
      readonly kind: 'strike';
      readonly tick: number;
      readonly attacker: number;
      readonly target: number;
      readonly damage: number;
      readonly targetHp: number;
    }
  | {
      readonly kind: 'death';
      readonly tick: number;
      readonly unit: number;
      readonly pos: Pos;
    };

export interface BattleState {
  tick: number;
  readonly units: BattleUnit[];
  readonly rng: Rng;
  readonly events: BattleEvent[];
  /** Side with pieces left once the other is wiped out; null while undecided. */
  winner: Side | null;
  finished: boolean;
  /** Tick of the most recent strike (0 if none yet). */
  lastDamageTick: number;
}

/** Damage multiplier of a plain strike. */
const BASE_DAMAGE_MULT = 1;
/** Damage reduction of a unit with no armor. */
const NO_ARMOR = 0;

function pieceSide(piece: ArmyPiece): Side {
  return sideOfX(piece.pos.x);
}

function posKey(pos: Pos): number {
  return pos.y * BOARD.width + pos.x;
}

/** Build a battle from the two armies (world coordinates, side taken from x). */
export function createBattle(armies: readonly ArmyPiece[], rng: Rng): BattleState {
  const seen = new Set<number>();
  const units: BattleUnit[] = armies.map((piece, id) => {
    const inBoard =
      piece.pos.x >= 0 &&
      piece.pos.x < BOARD.width &&
      piece.pos.y >= 0 &&
      piece.pos.y < BOARD.height;
    if (!inBoard || seen.has(posKey(piece.pos))) {
      throw new RangeError(`Bad army square ${squareName(piece.pos)}`);
    }
    seen.add(posKey(piece.pos));
    const maxHp = unitHp(piece.type, piece.stars);
    return {
      id,
      type: piece.type,
      stars: piece.stars,
      side: pieceSide(piece),
      x: piece.pos.x,
      y: piece.pos.y,
      hp: maxHp,
      maxHp,
      atk: unitAtk(piece.type, piece.stars),
      // First action lands on a random tick between 1 and the piece's speed.
      cooldown: 1 + int(rng, PIECES[piece.type].speed),
    };
  });
  const state: BattleState = {
    tick: 0,
    units,
    rng,
    events: [],
    winner: null,
    finished: false,
    lastDamageTick: 0,
  };
  checkFinished(state);
  return state;
}

function alive(state: BattleState): BattleUnit[] {
  return state.units.filter((u) => u.hp > 0);
}

function checkFinished(state: BattleState): void {
  const living = alive(state);
  const sides = new Set(living.map((u) => u.side));
  if (sides.size < 2) {
    state.finished = true;
    const [only] = [...sides];
    state.winner = only ?? null;
  } else if (state.tick >= BATTLE.maxTicks) {
    state.finished = true;
  }
}

function damageFor(attacker: BattleUnit, _target: BattleUnit): number {
  const raw = attacker.atk * BASE_DAMAGE_MULT * (1 - NO_ARMOR);
  return Math.max(BATTLE.minDamage, Math.round(raw));
}

function moveUnit(state: BattleState, unit: BattleUnit, to: Pos): void {
  const from = { x: unit.x, y: unit.y };
  unit.x = to.x;
  unit.y = to.y;
  state.events.push({ kind: 'move', tick: state.tick, unit: unit.id, from, to });
  if (unit.type !== 'N' && sideOfX(from.x) !== sideOfX(to.x)) {
    state.events.push({ kind: 'portal', tick: state.tick, unit: unit.id, from, to });
  }
}

function act(state: BattleState, unit: BattleUnit): void {
  const living = alive(state);
  const at = new Map(living.map((u) => [posKey(u), u]));
  const occupied = (p: Pos): boolean => at.has(posKey(p));
  const from = { x: unit.x, y: unit.y };

  const targets = generateStrikes(unit.type, unit.side, from, occupied)
    .map((p) => at.get(posKey(p)))
    .filter((u): u is BattleUnit => u !== undefined && u.side !== unit.side);

  const target = targets.reduce<BattleUnit | null>(
    (best, t) =>
      best === null || t.hp < best.hp || (t.hp === best.hp && t.id < best.id) ? t : best,
    null,
  );

  if (target !== null) {
    const damage = damageFor(unit, target);
    target.hp = Math.max(0, target.hp - damage);
    state.events.push({
      kind: 'strike',
      tick: state.tick,
      attacker: unit.id,
      target: target.id,
      damage,
      targetHp: target.hp,
    });
    state.lastDamageTick = state.tick;
    if (target.hp === 0) {
      const pos = { x: target.x, y: target.y };
      state.events.push({ kind: 'death', tick: state.tick, unit: target.id, pos });
      moveUnit(state, unit, pos);
    }
    unit.cooldown = PIECES[unit.type].speed;
    return;
  }

  const step = findStep({
    type: unit.type,
    side: unit.side,
    from,
    occupied,
    enemies: living.filter((u) => u.side !== unit.side).map((u) => ({ x: u.x, y: u.y })),
  });
  if (step === null) {
    unit.cooldown = 1;
    return;
  }
  moveUnit(state, unit, step);
  unit.cooldown = PIECES[unit.type].speed;
}

/** Advance the battle by one tick. Does nothing once finished. */
export function stepBattle(state: BattleState): void {
  if (state.finished) return;
  state.tick += 1;
  const order = shuffle(state.rng, alive(state));
  for (const unit of order) {
    if (unit.hp <= 0) continue;
    unit.cooldown -= 1;
    if (unit.cooldown <= 0) act(state, unit);
  }
  checkFinished(state);
}

/** Run a battle to its end and return the final state (with the full event log). */
export function runBattle(armies: readonly ArmyPiece[], rng: Rng): BattleState {
  const state = createBattle(armies, rng);
  while (!state.finished) stepBattle(state);
  return state;
}
