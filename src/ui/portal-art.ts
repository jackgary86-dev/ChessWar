/**
 * Portal squares, the bridge across the wall, and the burst when a piece passes
 * through: the signature element of the game.
 *
 * Idle loop: rings and swirl arcs turn slowly and the bridge's runes travel
 * across. With reduced motion everything holds at phase 0, which is the still
 * frame. The phase helpers are pure so they are unit-testable.
 */
const TWO_PI = Math.PI * 2;
/** One idle loop, in ms; every layer's speed is a whole number of turns per loop. */
export const PORTAL_LOOP_MS = 6000;

const SWIRL_ARMS = 3;
const RINGS = 3;
const RUNES = 4;
const BURST_RAYS = 10;

/** 0..1 through the idle loop; always 0 for the still frame. */
export function loopPhase(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return (((timeMs % PORTAL_LOOP_MS) + PORTAL_LOOP_MS) % PORTAL_LOOP_MS) / PORTAL_LOOP_MS;
}

/** Start angles (radians) of the swirl arms; they turn once per loop. */
export function swirlAngles(phase: number): number[] {
  return Array.from({ length: SWIRL_ARMS }, (_, i) => phase * TWO_PI + (i * TWO_PI) / SWIRL_ARMS);
}

/** Positions (0..1 along the bridge) of the runes drifting across it. */
export function runePositions(phase: number): number[] {
  return Array.from({ length: RUNES }, (_, i) => (phase + i / RUNES) % 1);
}

export interface BurstRay {
  /** Angle in radians. */
  readonly angle: number;
  /** Distance from the center, in squares. */
  readonly inner: number;
  readonly outer: number;
}

const BURST_START = 0.2;
const BURST_REACH = 0.55;
const BURST_RAY_LENGTH = 0.22;

/** Rays of a burst at `progress` 0..1; they fly outward and the ring grows. */
export function burstRays(progress: number): BurstRay[] {
  const inner = BURST_START + BURST_REACH * progress;
  return Array.from({ length: BURST_RAYS }, (_, i) => ({
    angle: (i * TWO_PI) / BURST_RAYS,
    inner,
    outer: inner + BURST_RAY_LENGTH * (1 - progress),
  }));
}

export interface PortalColors {
  readonly portal: string;
  readonly wall: string;
}

const DISC_ALPHA = 0.75;
const CORE_ALPHA = 0.9;

/** One portal square: dark well, glowing rings, turning swirl arms and a bright core. */
export function drawPortalSquare(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  cell: number,
  colors: PortalColors,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const phase = loopPhase(timeMs, reducedMotion);
  const cx = at.x + cell / 2;
  const cy = at.y + cell / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(at.x, at.y, cell, cell);
  ctx.clip();

  const well = ctx.createRadialGradient(cx, cy, cell * 0.05, cx, cy, cell * 0.72);
  well.addColorStop(0, colors.portal);
  well.addColorStop(0.55, colors.wall);
  well.addColorStop(1, colors.wall);
  ctx.globalAlpha = DISC_ALPHA;
  ctx.fillStyle = well;
  ctx.fillRect(at.x, at.y, cell, cell);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.portal;
  for (let i = 1; i <= RINGS; i++) {
    ctx.globalAlpha = 0.25 + 0.2 * (RINGS - i);
    ctx.lineWidth = Math.max(1, cell * 0.025);
    ctx.beginPath();
    ctx.arc(cx, cy, cell * (0.14 + 0.11 * i), 0, TWO_PI);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(1.5, cell * 0.05);
  ctx.lineCap = 'round';
  for (const start of swirlAngles(phase)) {
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.33, start, start + Math.PI * 0.55);
    ctx.stroke();
  }

  ctx.globalAlpha = CORE_ALPHA;
  ctx.fillStyle = colors.portal;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.09, 0, TWO_PI);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = colors.portal;
  ctx.lineWidth = Math.max(1, cell * 0.05);
  ctx.strokeRect(at.x + 1, at.y + 1, cell - 2, cell - 2);
}

/**
 * The bridge across the wall gap: a lit span with runes drifting along it.
 * `rect` is the bridge in canvas px; `along` is true when it runs left to right.
 */
export function drawBridgeSpan(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  along: 'x' | 'y',
  colors: PortalColors,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const phase = loopPhase(timeMs, reducedMotion);
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = colors.portal;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.wall;
  const length = along === 'x' ? rect.w : rect.h;
  const width = along === 'x' ? rect.h : rect.w;
  const size = Math.max(1.5, width * 0.28);
  for (const t of runePositions(phase)) {
    const pos = t * length;
    const x = along === 'x' ? rect.x + pos : rect.x + width / 2;
    const y = along === 'x' ? rect.y + width / 2 : rect.y + pos;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

/** A burst of light at a portal square when a piece passes through. */
export function drawBurst(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  cell: number,
  color: string,
  progress: number,
): void {
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, cell * 0.06);
  ctx.beginPath();
  ctx.arc(center.x, center.y, cell * (BURST_START + BURST_REACH * progress), 0, TWO_PI);
  ctx.stroke();
  for (const ray of burstRays(progress)) {
    ctx.beginPath();
    ctx.moveTo(
      center.x + Math.cos(ray.angle) * cell * ray.inner,
      center.y + Math.sin(ray.angle) * cell * ray.inner,
    );
    ctx.lineTo(
      center.x + Math.cos(ray.angle) * cell * ray.outer,
      center.y + Math.sin(ray.angle) * cell * ray.outer,
    );
    ctx.stroke();
  }
  ctx.restore();
}
