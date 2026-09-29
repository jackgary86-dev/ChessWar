/**
 * Combat animation driven by the simulation's event list.
 *
 * The sim advances in whole ticks; this module turns a battle's events into
 * what to draw at any fractional time `t` (measured in ticks). Events of tick
 * `k` animate over `t` in [k-1, k], so the sim must have been stepped to at
 * least `ceil(t)` before drawing (`advancePlayback` does that). Nothing here
 * touches the DOM or the clock, and nothing mutates the battle.
 */
import { BATTLE } from '@sim/data.ts';
import type { BattleEvent, BattleState } from '@sim/battle.ts';
import type { Pos } from '@sim/board.ts';
import type { PieceType, Side, StarLevel } from '@sim/types.ts';
import type { DrawPiece } from './render.ts';

export type PlaybackSpeed = (typeof BATTLE.speeds)[number];

/** Effects the renderer overlays on the board. Positions are world squares. */
export type Effect =
  | {
      readonly kind: 'line';
      readonly from: Pos;
      readonly to: Pos;
      /** Attacker's side, or 'heal' for a Blessing beam. */
      readonly tone: Side | 'heal';
      /** 0 at the start of the effect, 1 when it has finished. */
      readonly progress: number;
    }
  | {
      readonly kind: 'float';
      readonly pos: Pos;
      readonly text: string;
      readonly tone: 'damage' | 'heal';
      readonly progress: number;
    }
  | {
      readonly kind: 'ring';
      readonly pos: Pos;
      readonly progress: number;
    }
  | {
      /** Light burst at a portal square as a piece passes through. */
      readonly kind: 'burst';
      readonly pos: Pos;
      readonly progress: number;
    };

export interface Frame {
  readonly pieces: readonly DrawPiece[];
  readonly effects: readonly Effect[];
}

/** Start-of-fight state of one unit, captured before the first tick. */
export interface UnitSnapshot {
  readonly id: number;
  readonly type: PieceType;
  readonly side: Side;
  readonly stars: StarLevel;
  readonly x: number;
  readonly y: number;
  readonly maxHp: number;
}

/** Capture the units of a battle that has not been stepped yet. */
export function snapshotUnits(battle: BattleState): UnitSnapshot[] {
  return battle.units.map((u) => ({
    id: u.id,
    type: u.type,
    side: u.side,
    stars: u.stars,
    x: u.x,
    y: u.y,
    maxHp: u.maxHp,
  }));
}

// Presentation timing, in ticks.
const HALF = 0.5;
/** Strike lines and heal beams last a fraction of a tick. */
const LINE_LIFETIME = 0.7;
const FLOAT_LIFETIME = 1.6;
const RING_LIFETIME = 1;
const BURST_LIFETIME = 1.2;
/** A dying piece fades out over this many ticks. */
const FADE_LIFETIME = 1;
/** Knight hop height in squares at the top of its arc. */
const KNIGHT_HOP = 0.55;
const FULL = 1;

/** Ease-in-out so moves accelerate and settle rather than sliding at constant speed. */
function ease(p: number): number {
  return p * p * (3 - 2 * p);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(FULL, v));
}

interface UnitState {
  readonly snap: UnitSnapshot;
  x: number;
  y: number;
  hp: number;
  lift: number;
  /** Tick time at which the unit began to die, or null while alive. */
  diedAt: number | null;
}

/**
 * What to draw at tick time `t`. With `reducedMotion`, pieces snap between
 * squares (no easing or hop) and floating text does not drift.
 */
export function frameAt(
  snapshot: readonly UnitSnapshot[],
  events: readonly BattleEvent[],
  t: number,
  reducedMotion: boolean,
): Frame {
  const units = new Map<number, UnitState>(
    snapshot.map((snap) => [
      snap.id,
      { snap, x: snap.x, y: snap.y, hp: snap.maxHp, lift: 0, diedAt: null },
    ]),
  );
  const effects: Effect[] = [];

  for (const event of events) {
    const age = t - (event.tick - FULL);
    if (age <= 0) break;
    const progress = clamp01(age);
    switch (event.kind) {
      case 'move':
      case 'portal': {
        const unit = units.get(event.unit);
        if (!unit) break;
        const p = reducedMotion ? (progress >= HALF ? FULL : 0) : ease(progress);
        unit.x = event.from.x + (event.to.x - event.from.x) * p;
        unit.y = event.from.y + (event.to.y - event.from.y) * p;
        const hopping = unit.snap.type === 'N' && !reducedMotion && progress < FULL;
        unit.lift = hopping ? Math.sin(progress * Math.PI) * KNIGHT_HOP : 0;
        if (event.kind === 'portal' && age < BURST_LIFETIME) {
          // One burst where the piece entered the portal and one where it came out.
          const burst = reducedMotion ? HALF : age / BURST_LIFETIME;
          effects.push(
            { kind: 'burst', pos: event.from, progress: burst },
            { kind: 'burst', pos: event.to, progress: burst },
          );
        }
        break;
      }
      case 'strike': {
        const attacker = units.get(event.attacker);
        const target = units.get(event.target);
        if (!attacker || !target) break;
        if (progress >= HALF) target.hp = event.targetHp;
        if (age < LINE_LIFETIME) {
          effects.push({
            kind: 'line',
            from: { x: attacker.x, y: attacker.y },
            to: { x: target.x, y: target.y },
            tone: attacker.snap.side,
            progress: age / LINE_LIFETIME,
          });
        }
        if (age < FLOAT_LIFETIME) {
          effects.push({
            kind: 'float',
            pos: { x: target.x, y: target.y },
            text: `-${String(event.damage)}`,
            tone: 'damage',
            progress: reducedMotion ? HALF : age / FLOAT_LIFETIME,
          });
        }
        break;
      }
      case 'heal': {
        const healer = units.get(event.healer);
        const target = units.get(event.target);
        if (!healer || !target) break;
        if (progress >= HALF) target.hp = Math.min(target.snap.maxHp, target.hp + event.amount);
        if (age < LINE_LIFETIME) {
          effects.push({
            kind: 'line',
            from: { x: healer.x, y: healer.y },
            to: { x: target.x, y: target.y },
            tone: 'heal',
            progress: age / LINE_LIFETIME,
          });
        }
        if (age < FLOAT_LIFETIME) {
          effects.push({
            kind: 'float',
            pos: { x: target.x, y: target.y },
            text: `+${String(event.amount)}`,
            tone: 'heal',
            progress: reducedMotion ? HALF : age / FLOAT_LIFETIME,
          });
        }
        break;
      }
      case 'death': {
        const unit = units.get(event.unit);
        if (!unit) break;
        unit.diedAt = event.tick - FULL;
        if (age < RING_LIFETIME) {
          effects.push({ kind: 'ring', pos: event.pos, progress: age / RING_LIFETIME });
        }
        break;
      }
    }
  }

  const pieces: DrawPiece[] = [];
  for (const unit of units.values()) {
    let alpha = FULL;
    if (unit.diedAt !== null) {
      alpha = FULL - (reducedMotion ? 0 : clamp01((t - unit.diedAt) / FADE_LIFETIME));
      if (alpha <= 0 || (reducedMotion && t - unit.diedAt >= FADE_LIFETIME)) continue;
    }
    pieces.push({
      type: unit.snap.type,
      side: unit.snap.side,
      stars: unit.snap.stars,
      x: unit.x,
      y: unit.y,
      hp: unit.hp,
      maxHp: unit.snap.maxHp,
      lift: unit.lift,
      alpha,
    });
  }
  return { pieces, effects };
}

// ---------------------------------------------------------------------------
// Playback: speed control and pacing the sim to the animation clock
// ---------------------------------------------------------------------------

export interface Playback {
  /** Animation clock in ticks. */
  time: number;
  speed: PlaybackSpeed;
}

/** Ticks to linger on the final position before the result is shown. */
export const END_HOLD_TICKS = 1.5;

export function createPlayback(): Playback {
  return { time: 0, speed: BATTLE.speeds[0] };
}

export function setSpeed(playback: Playback, speed: PlaybackSpeed): void {
  playback.speed = speed;
}

/**
 * Move the clock forward by `dtMs` of real time, calling `stepSim` (one sim
 * tick per call) until the sim is ahead of the clock or the fight is over.
 */
export function advancePlayback(
  playback: Playback,
  dtMs: number,
  battle: BattleState,
  stepSim: () => void,
): void {
  playback.time += (dtMs / BATTLE.tickMs) * playback.speed;
  while (!battle.finished && battle.tick < Math.ceil(playback.time)) stepSim();
  playback.time = Math.min(
    playback.time,
    battle.finished ? battle.tick + END_HOLD_TICKS : Infinity,
  );
}

/** "Skip to result": the caller runs the sim to its end, then jumps the clock past it. */
export function skipPlayback(playback: Playback, battle: BattleState): void {
  playback.time = battle.tick + END_HOLD_TICKS;
}

/** The animation has caught up with a finished fight, so the result can show. */
export function playbackDone(playback: Playback, battle: BattleState): boolean {
  return battle.finished && playback.time >= battle.tick + END_HOLD_TICKS;
}
