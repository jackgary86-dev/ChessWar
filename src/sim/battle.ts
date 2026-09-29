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
 * Star abilities (2★ / 3★) fire as part of the strike. A battle ends when one
 * side is wiped out, after `BATTLE.idleTickLimit` ticks without damage, or at
 * `BATTLE.maxTicks`; the last two are decided on remaining material.
 */
import {
  ORTHOGONAL_DIRS,
  generateStrikes,
  inBounds,
  sideOfX,
  squareName,
  stepAllowed,
} from './board.ts';
import type { Pos } from './board.ts';
import { ABILITY, BATTLE, BOARD, PIECES, copiesForStars, unitAtk, unitHp } from './data.ts';
import { findStep } from './pathfinding.ts';
import { int, shuffle } from './rng.ts';
import type { Rng } from './rng.ts';
import type { AbilityStar, PieceType, Side, StarLevel } from './types.ts';

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
      /** Plain strike, or damage dealt by a Knight Fork / Queen Pierce ability. */
      readonly via: 'strike' | 'fork' | 'pierce';
    }
  | {
      /** Bishop Blessing: `amount` is the HP actually restored (never above max). */
      readonly kind: 'heal';
      readonly tick: number;
      readonly healer: number;
      readonly target: number;
      readonly amount: number;
    }
  | {
      readonly kind: 'death';
      readonly tick: number;
      readonly unit: number;
      readonly pos: Pos;
    };

/** Why a fight ended. */
export type BattleEndReason = 'elimination' | 'idle' | 'timeout';

export interface BattleState {
  tick: number;
  readonly units: BattleUnit[];
  readonly rng: Rng;
  readonly events: BattleEvent[];
  /** Winning side once finished; null while undecided or on a draw. */
  winner: Side | null;
  finished: boolean;
  /** Set when finished. A finished battle with a null winner is a draw. */
  endReason: BattleEndReason | null;
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
    endReason: null,
    lastDamageTick: 0,
  };
  checkFinished(state);
  return state;
}

function alive(state: BattleState): BattleUnit[] {
  return state.units.filter((u) => u.hp > 0);
}

/**
 * Remaining material of a side: Σ cost × 3^(stars−1) × hp / maxHp over its
 * living pieces (spec §3.3 tiebreak).
 */
export function material(units: readonly BattleUnit[], side: Side): number {
  return units
    .filter((u) => u.side === side && u.hp > 0)
    .reduce((sum, u) => sum + PIECES[u.type].cost * copiesForStars(u.stars) * (u.hp / u.maxHp), 0);
}

function finish(state: BattleState, reason: BattleEndReason): void {
  state.finished = true;
  state.endReason = reason;
  if (reason === 'elimination') {
    const survivor = alive(state)[0];
    state.winner = survivor?.side ?? null;
    return;
  }
  const [ivory, ebony] = [material(state.units, 0), material(state.units, 1)];
  state.winner = ivory === ebony ? null : ivory > ebony ? 0 : 1;
}

/**
 * End conditions: one side wiped out; otherwise no damage for `idleTickLimit`
 * ticks or `maxTicks` reached, decided on remaining material (exact tie = draw).
 */
function checkFinished(state: BattleState): void {
  const sides = new Set(alive(state).map((u) => u.side));
  if (sides.size < 2) finish(state, 'elimination');
  else if (state.tick - state.lastDamageTick >= BATTLE.idleTickLimit) finish(state, 'idle');
  else if (state.tick >= BATTLE.maxTicks) finish(state, 'timeout');
}

/** Star level that unlocks an ability, or null at 1★ (abilities are off). */
function abilityStar(unit: BattleUnit): AbilityStar | null {
  return unit.stars === 1 ? null : unit.stars;
}

/**
 * Fraction of incoming damage a unit shrugs off: Rook Fortress, or Pawn Shield
 * Wall while a friendly piece stands orthogonally adjacent.
 */
function armorOf(target: BattleUnit, at: ReadonlyMap<number, BattleUnit>): number {
  const star = abilityStar(target);
  if (star === null) return NO_ARMOR;
  if (target.type === 'R') return ABILITY.fortressReduction[star];
  if (target.type === 'P') {
    const guarded = ORTHOGONAL_DIRS.some((dir) => {
      const near = at.get(posKey({ x: target.x + dir.x, y: target.y + dir.y }));
      return near?.side === target.side;
    });
    return guarded ? ABILITY.shieldWallReduction[star] : NO_ARMOR;
  }
  return NO_ARMOR;
}

function damageFor(attacker: BattleUnit, mult: number, armor: number): number {
  return Math.max(BATTLE.minDamage, Math.round(attacker.atk * mult * (1 - armor)));
}

function lowestHpFirst(a: BattleUnit, b: BattleUnit): number {
  return a.hp - b.hp || a.id - b.id;
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

function hit(
  state: BattleState,
  at: Map<number, BattleUnit>,
  attacker: BattleUnit,
  target: BattleUnit,
  mult: number,
  via: 'strike' | 'fork' | 'pierce',
): void {
  const damage = damageFor(attacker, mult, armorOf(target, at));
  target.hp = Math.max(0, target.hp - damage);
  state.events.push({
    kind: 'strike',
    tick: state.tick,
    attacker: attacker.id,
    target: target.id,
    damage,
    targetHp: target.hp,
    via,
  });
  state.lastDamageTick = state.tick;
  if (target.hp === 0) {
    at.delete(posKey(target));
    state.events.push({
      kind: 'death',
      tick: state.tick,
      unit: target.id,
      pos: { x: target.x, y: target.y },
    });
  }
}

/** The enemy directly behind `target`, as seen from `attacker` (Queen Pierce). */
function behind(
  attacker: BattleUnit,
  target: BattleUnit,
  at: ReadonlyMap<number, BattleUnit>,
): BattleUnit | undefined {
  const next = {
    x: target.x + Math.sign(target.x - attacker.x),
    y: target.y + Math.sign(target.y - attacker.y),
  };
  if (!inBounds(next) || !stepAllowed(target, next)) return undefined;
  const other = at.get(posKey(next));
  return other !== undefined && other.side !== attacker.side ? other : undefined;
}

/** Bishop Blessing: heal the most wounded living ally (biggest HP gap). */
function bless(state: BattleState, healer: BattleUnit, star: AbilityStar): void {
  let wounded: BattleUnit | null = null;
  for (const ally of alive(state)) {
    if (ally.side !== healer.side || ally.hp >= ally.maxHp) continue;
    if (wounded === null || ally.maxHp - ally.hp > wounded.maxHp - wounded.hp) wounded = ally;
  }
  if (wounded === null) return;
  const before = wounded.hp;
  wounded.hp = Math.min(
    wounded.maxHp,
    wounded.hp + Math.round(healer.atk * ABILITY.blessingHealRatio[star]),
  );
  state.events.push({
    kind: 'heal',
    tick: state.tick,
    healer: healer.id,
    target: wounded.id,
    amount: wounded.hp - before,
  });
}

function act(state: BattleState, unit: BattleUnit): void {
  const living = alive(state);
  const at = new Map(living.map((u) => [posKey(u), u]));
  const occupied = (p: Pos): boolean => at.has(posKey(p));
  const from = { x: unit.x, y: unit.y };

  const targets = generateStrikes(unit.type, unit.side, from, occupied)
    .map((p) => at.get(posKey(p)))
    .filter((u): u is BattleUnit => u !== undefined && u.side !== unit.side)
    .sort(lowestHpFirst);

  const [target, ...others] = targets;
  if (target !== undefined) {
    const star = abilityStar(unit);
    // Extra victims are picked before the strike lands so a kill cannot change them.
    const extras: { unit: BattleUnit; mult: number; via: 'fork' | 'pierce' }[] = [];
    if (star !== null && unit.type === 'N') {
      for (const other of others.slice(0, ABILITY.forkExtraTargets[star])) {
        extras.push({ unit: other, mult: BASE_DAMAGE_MULT, via: 'fork' });
      }
    }
    if (star !== null && unit.type === 'Q') {
      const rear = behind(unit, target, at);
      if (rear !== undefined) {
        extras.push({ unit: rear, mult: ABILITY.pierceRatio[star], via: 'pierce' });
      }
    }

    const targetPos = { x: target.x, y: target.y };
    hit(state, at, unit, target, BASE_DAMAGE_MULT, 'strike');
    for (const extra of extras) hit(state, at, unit, extra.unit, extra.mult, extra.via);
    if (star !== null && unit.type === 'B') bless(state, unit, star);
    // Like a chess capture: move onto the fallen target's square if it is free.
    if (target.hp === 0 && !occupied(targetPos)) moveUnit(state, unit, targetPos);
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
