/**
 * Combat visual effects as parameters for canvas drawing: strike styles per
 * piece, hit flash, damage and heal numbers, the death shatter and the five
 * ability effects (Shield Wall, Fork, Blessing, Fortress, Pierce).
 *
 * Everything here is pure data and geometry so it is unit-testable; the draw
 * functions only read those parameters. Progress runs 0 (start) to 1 (done).
 * Colors come from the theme, so both sides stay readable on either square.
 */
import type { PieceType } from '@sim/types.ts';

const TWO_PI = Math.PI * 2;
const HALF = 0.5;

// ---------------------------------------------------------------------------
// Strike styles
// ---------------------------------------------------------------------------

export type StrikeShape = 'jab' | 'impact' | 'line';

export interface StrikeStyle {
  readonly shape: StrikeShape;
  /** Line width as a fraction of a square. */
  readonly width: number;
  /** Lines drawn side by side (the queen's double stroke). */
  readonly strands: number;
}

const STRIKE_STYLES: Readonly<Record<PieceType, StrikeStyle>> = {
  /** Short, thick jab that lunges out and snaps back. */
  P: { shape: 'jab', width: 0.13, strands: 1 },
  /** Leaps in: no line, a starburst lands on the target. */
  N: { shape: 'impact', width: 0.08, strands: 1 },
  /** Diagonal line strike, thin and sharp. */
  B: { shape: 'line', width: 0.06, strands: 1 },
  /** Straight line strike, heavy. */
  R: { shape: 'line', width: 0.12, strands: 1 },
  /** Two parallel strands. */
  Q: { shape: 'line', width: 0.06, strands: 2 },
};

export function strikeStyle(type: PieceType): StrikeStyle {
  return STRIKE_STYLES[type];
}

/** Share of the attacker-to-target distance the jab reaches at its peak. */
const JAB_REACH = 0.6;
const STRAND_GAP = 0.09;

/** How far along the line (0..1) a jab has reached: out for the first half, back for the second. */
export function jabReach(progress: number): number {
  return JAB_REACH * (1 - Math.abs(2 * progress - 1));
}

/** Perpendicular offsets, in squares, of each strand of a line strike. */
export function strandOffsets(strands: number): number[] {
  const first = (-(strands - 1) * STRAND_GAP) / 2;
  return Array.from({ length: strands }, (_, i) => first + i * STRAND_GAP);
}

// ---------------------------------------------------------------------------
// Impact starburst (knight landing) and hit flash
// ---------------------------------------------------------------------------

const IMPACT_RAYS = 8;
const IMPACT_START = 0.12;
const IMPACT_REACH = 0.4;
const IMPACT_LENGTH = 0.2;

export interface Ray {
  readonly angle: number;
  readonly inner: number;
  readonly outer: number;
}

/** Rays of the knight's landing burst; they fly out and shorten as it fades. */
export function impactRays(progress: number): Ray[] {
  const inner = IMPACT_START + IMPACT_REACH * progress;
  return Array.from({ length: IMPACT_RAYS }, (_, i) => ({
    angle: (i * TWO_PI) / IMPACT_RAYS,
    inner,
    outer: inner + IMPACT_LENGTH * (1 - progress),
  }));
}

/** Peak opacity of the white flash over a struck piece. */
const FLASH_PEAK = 0.75;
const FLASH_RISE = 0.2;

/** Opacity of the hit flash: a quick rise, then a fade. */
export function hitFlashAlpha(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  const shape = progress < FLASH_RISE ? progress / FLASH_RISE : (1 - progress) / (1 - FLASH_RISE);
  return FLASH_PEAK * shape;
}

// ---------------------------------------------------------------------------
// Floating numbers
// ---------------------------------------------------------------------------

export interface FloatStyle {
  /** Squares the number rises over its life. */
  readonly rise: number;
  /** Font size as a fraction of a square. */
  readonly size: number;
  /** Stroke outline width as a fraction of a square. */
  readonly outline: number;
}

const FLOAT_STYLES = {
  damage: { rise: 0.7, size: 0.34, outline: 0.08 },
  heal: { rise: 0.7, size: 0.3, outline: 0.08 },
} as const satisfies Record<'damage' | 'heal', FloatStyle>;

export function floatStyle(tone: 'damage' | 'heal'): FloatStyle {
  return FLOAT_STYLES[tone];
}

/** Numbers pop in slightly larger, then settle. */
const POP_SCALE = 0.35;
const POP_DURATION = 0.25;

export function floatScale(progress: number): number {
  return 1 + POP_SCALE * Math.max(0, 1 - progress / POP_DURATION);
}

// ---------------------------------------------------------------------------
// Death shatter
// ---------------------------------------------------------------------------

const SHARDS = 7;
const SHARD_REACH = 0.55;
const SHARD_DROP = 0.25;
const SHARD_SIZE = 0.13;

export interface Shard {
  /** Offset from the piece's center, in squares. */
  readonly dx: number;
  readonly dy: number;
  /** Half-size of the square shard, in squares; shrinks to nothing. */
  readonly size: number;
  readonly rotation: number;
}

/** Fragments of a dying piece: they fly outward, tumble, fall a little and shrink. */
export function shatterShards(progress: number): Shard[] {
  const reach = SHARD_REACH * Math.sqrt(progress);
  return Array.from({ length: SHARDS }, (_, i) => {
    const angle = (i * TWO_PI) / SHARDS + HALF;
    return {
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach + SHARD_DROP * progress * progress,
      size: SHARD_SIZE * (1 - progress),
      rotation: angle + progress * Math.PI,
    };
  });
}

// ---------------------------------------------------------------------------
// Ability effects
// ---------------------------------------------------------------------------

export type AbilityVfx = 'shield' | 'fortress' | 'blessing';

const SHIELD_SEGMENTS = 3;
const SHIELD_RADIUS = 0.46;
const SHIELD_ARC = 0.7;

/** Shield Wall: three short arcs (radians) that pulse around a guarded pawn. */
export function shieldArcs(progress: number): { start: number; end: number; radius: number }[] {
  const radius = SHIELD_RADIUS + 0.08 * Math.sin(progress * Math.PI);
  return Array.from({ length: SHIELD_SEGMENTS }, (_, i) => {
    const start = (i * TWO_PI) / SHIELD_SEGMENTS - Math.PI / 2;
    return { start, end: start + SHIELD_ARC, radius };
  });
}

/** Fortress: a square outline that thickens on the hit and settles. */
export function fortressOutline(progress: number): { half: number; width: number } {
  return { half: 0.44 - 0.04 * progress, width: 0.1 * (1 - progress) + 0.02 };
}

const BLESS_MOTES = 6;

/** Blessing: motes of light rising from around the healed piece. */
export function blessingMotes(progress: number): { dx: number; dy: number; size: number }[] {
  return Array.from({ length: BLESS_MOTES }, (_, i) => {
    const angle = (i * TWO_PI) / BLESS_MOTES;
    return {
      dx: Math.cos(angle) * 0.32,
      dy: Math.sin(angle) * 0.2 - 0.6 * progress,
      size: 0.06 * (1 - progress),
    };
  });
}

const MERGE_RING_START = 0.2;
const MERGE_RING_GROWTH = 0.5;
const MERGE_RISE = 0.7;
const MERGE_SPREAD = 0.3;

/** Merge burst: a growing ring and one rising star per star level reached. */
export function mergeBurst(
  progress: number,
  stars: number,
): { ringRadius: number; sparks: { dx: number; dy: number; size: number }[] } {
  const first = (-(stars - 1) * MERGE_SPREAD) / 2;
  return {
    ringRadius: MERGE_RING_START + MERGE_RING_GROWTH * progress,
    sparks: Array.from({ length: stars }, (_, i) => ({
      dx: first + i * MERGE_SPREAD,
      dy: -MERGE_RISE * progress,
      size: 0.11 * (1 - progress * HALF),
    })),
  };
}

/** Fork: the branch line to a second target starts a beat after the first. */
export const FORK_DELAY = 0.15;

/** Pierce: the follow-through line is drawn thinner than the main strike. */
export const PIERCE_WIDTH_SCALE = 0.7;

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------

export interface VfxColors {
  readonly ivory: string;
  readonly ebony: string;
  readonly heal: string;
  readonly brass: string;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export function drawImpact(
  ctx: CanvasRenderingContext2D,
  at: Point,
  cell: number,
  color: string,
  progress: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, cell * 0.06);
  for (const ray of impactRays(progress)) {
    ctx.beginPath();
    ctx.moveTo(
      at.x + Math.cos(ray.angle) * ray.inner * cell,
      at.y + Math.sin(ray.angle) * ray.inner * cell,
    );
    ctx.lineTo(
      at.x + Math.cos(ray.angle) * ray.outer * cell,
      at.y + Math.sin(ray.angle) * ray.outer * cell,
    );
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFlash(
  ctx: CanvasRenderingContext2D,
  at: Point,
  cell: number,
  progress: number,
): void {
  ctx.save();
  ctx.globalAlpha = hitFlashAlpha(progress);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(at.x, at.y, cell * 0.36, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

export function drawShatter(
  ctx: CanvasRenderingContext2D,
  at: Point,
  cell: number,
  color: string,
  progress: number,
): void {
  ctx.save();
  ctx.fillStyle = color;
  for (const shard of shatterShards(progress)) {
    ctx.save();
    ctx.translate(at.x + shard.dx * cell, at.y + shard.dy * cell);
    ctx.rotate(shard.rotation);
    const s = shard.size * cell;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.restore();
  }
  ctx.restore();
}

export function drawAbility(
  ctx: CanvasRenderingContext2D,
  kind: AbilityVfx,
  at: Point,
  cell: number,
  colors: VfxColors,
  progress: number,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  if (kind === 'shield') {
    ctx.strokeStyle = colors.brass;
    ctx.lineWidth = Math.max(1.5, cell * 0.06);
    for (const arc of shieldArcs(progress)) {
      ctx.beginPath();
      ctx.arc(at.x, at.y, arc.radius * cell, arc.start, arc.end);
      ctx.stroke();
    }
  } else if (kind === 'fortress') {
    const box = fortressOutline(progress);
    ctx.strokeStyle = colors.brass;
    ctx.lineWidth = Math.max(1.5, box.width * cell);
    ctx.strokeRect(
      at.x - box.half * cell,
      at.y - box.half * cell,
      box.half * 2 * cell,
      box.half * 2 * cell,
    );
  } else {
    ctx.fillStyle = colors.heal;
    for (const mote of blessingMotes(progress)) {
      ctx.beginPath();
      ctx.arc(
        at.x + mote.dx * cell,
        at.y + mote.dy * cell,
        Math.max(0, mote.size * cell),
        0,
        TWO_PI,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawMerge(
  ctx: CanvasRenderingContext2D,
  at: Point,
  cell: number,
  color: string,
  stars: number,
  progress: number,
): void {
  const burst = mergeBurst(progress, stars);
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, cell * 0.07);
  ctx.beginPath();
  ctx.arc(at.x, at.y, burst.ringRadius * cell, 0, TWO_PI);
  ctx.stroke();
  ctx.fillStyle = color;
  for (const spark of burst.sparks) {
    // A four-point star.
    const cx = at.x + spark.dx * cell;
    const cy = at.y + spark.dy * cell;
    const r = spark.size * cell;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const radius = i % 2 === 0 ? r : r * 0.4;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
