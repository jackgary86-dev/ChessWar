/**
 * Board tiles, the wall with its end caps, and the board frame.
 *
 * Geometry helpers are pure (and tested in both the side-by-side and the
 * stacked phone layout); the draw functions only use canvas calls, with no
 * randomness, so the art is identical every frame.
 */
import { BOARD } from '@sim/data.ts';
import type { Layout } from './layout.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The two colors a board's squares alternate between, and the wall and trim. */
export interface BoardPalette {
  readonly light: readonly [string, string];
  readonly dark: readonly [string, string];
  readonly wall: string;
  readonly trim: string;
}

const HALF = BOARD.width / 2;
const BEVEL_PX = 1;
const BEVEL_LIGHT = 'rgba(255, 255, 255, 0.10)';
const BEVEL_DARK = 'rgba(0, 0, 0, 0.14)';
const MORTAR = 'rgba(0, 0, 0, 0.45)';
const STONE_SHADE = 'rgba(255, 255, 255, 0.05)';
const WALL_EDGE_ALPHA = 0.35;
/** End caps overhang the wall by this much of the wall's own width. */
const CAP_OVERHANG = 0.9;
const CAP_LENGTH = 1.3;
const FRAME_ALPHA = 0.55;
const FRAME_WIDTH = 2;

/** The 8×8 area of board `board` (0 = Ivory, 1 = Ebony) in canvas px. */
export function boardRect(layout: Layout, board: 0 | 1): Rect {
  const left = board * HALF;
  const a = layout.toScreen({ x: left, y: 0 });
  const b = layout.toScreen({ x: left + HALF - 1, y: BOARD.height - 1 });
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x, b.x) + layout.cell - x,
    h: Math.max(a.y, b.y) + layout.cell - y,
  };
}

/** The strip between the boards where the wall stands. */
export function wallRect(layout: Layout): Rect {
  const first = boardRect(layout, 0);
  const second = boardRect(layout, 1);
  if (layout.stacked) {
    // Ivory is at the bottom, Ebony on top; the wall sits between them.
    const y = second.y + second.h;
    return { x: 0, y, w: layout.width, h: layout.wallGap };
  }
  return { x: first.x + first.w, y: 0, w: layout.wallGap, h: layout.height };
}

/** Pillar blocks at both ends of the wall, a little wider than the wall itself. */
export function wallCaps(layout: Layout): [Rect, Rect] {
  const wall = wallRect(layout);
  const overhang = layout.wallGap * CAP_OVERHANG;
  const length = layout.wallGap * CAP_LENGTH;
  if (layout.stacked) {
    const y = wall.y - (length - wall.h) / 2;
    return [
      { x: 0, y, w: overhang, h: length },
      { x: wall.w - overhang, y, w: overhang, h: length },
    ];
  }
  const x = wall.x - (length - wall.w) / 2;
  return [
    { x, y: 0, w: length, h: overhang },
    { x, y: wall.h - overhang, w: length, h: overhang },
  ];
}

export function drawTiles(ctx: CanvasRenderingContext2D, layout: Layout, p: BoardPalette): void {
  const { cell } = layout;
  const bevel = Math.max(1, Math.round(cell * 0.02)) * BEVEL_PX;
  for (let x = 0; x < BOARD.width; x++) {
    const board = x < HALF ? 0 : 1;
    for (let y = 0; y < BOARD.height; y++) {
      const dark = (x + y) % 2 === 1;
      const at = layout.toScreen({ x, y });
      ctx.fillStyle = (dark ? p.dark : p.light)[board];
      ctx.fillRect(at.x, at.y, cell, cell);
      // A faint bevel gives each tile an edge without hiding pieces.
      ctx.fillStyle = BEVEL_LIGHT;
      ctx.fillRect(at.x, at.y, cell, bevel);
      ctx.fillRect(at.x, at.y, bevel, cell);
      ctx.fillStyle = BEVEL_DARK;
      ctx.fillRect(at.x, at.y + cell - bevel, cell, bevel);
      ctx.fillRect(at.x + cell - bevel, at.y, bevel, cell);
    }
  }
}

export function drawWall(ctx: CanvasRenderingContext2D, layout: Layout, p: BoardPalette): void {
  const wall = wallRect(layout);
  ctx.fillStyle = p.wall;
  ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

  // Stone courses: one block per square along the wall, alternately shaded, with mortar between.
  const blocks = BOARD.height;
  ctx.lineWidth = 1;
  for (let i = 0; i < blocks; i++) {
    const at = i * layout.cell;
    const block: Rect = layout.stacked
      ? { x: at, y: wall.y, w: layout.cell, h: wall.h }
      : { x: wall.x, y: at, w: wall.w, h: layout.cell };
    if (i % 2 === 1) {
      ctx.fillStyle = STONE_SHADE;
      ctx.fillRect(block.x, block.y, block.w, block.h);
    }
    ctx.strokeStyle = MORTAR;
    ctx.beginPath();
    if (layout.stacked) {
      ctx.moveTo(block.x, block.y);
      ctx.lineTo(block.x, block.y + block.h);
    } else {
      ctx.moveTo(block.x, block.y);
      ctx.lineTo(block.x + block.w, block.y);
    }
    ctx.stroke();
  }

  // Brass edge lines where the wall meets the boards.
  ctx.globalAlpha = WALL_EDGE_ALPHA;
  ctx.fillStyle = p.trim;
  if (layout.stacked) {
    ctx.fillRect(wall.x, wall.y, wall.w, 1);
    ctx.fillRect(wall.x, wall.y + wall.h - 1, wall.w, 1);
  } else {
    ctx.fillRect(wall.x, wall.y, 1, wall.h);
    ctx.fillRect(wall.x + wall.w - 1, wall.y, 1, wall.h);
  }
  ctx.globalAlpha = 1;

  for (const cap of wallCaps(layout)) {
    ctx.fillStyle = p.wall;
    ctx.fillRect(cap.x, cap.y, cap.w, cap.h);
    ctx.strokeStyle = p.trim;
    ctx.lineWidth = Math.max(1, layout.cell * 0.03);
    ctx.strokeRect(cap.x + 0.5, cap.y + 0.5, cap.w - 1, cap.h - 1);
  }
}

/** A thin brass line just inside the edge of each board. */
export function drawFrame(ctx: CanvasRenderingContext2D, layout: Layout, p: BoardPalette): void {
  ctx.globalAlpha = FRAME_ALPHA;
  ctx.strokeStyle = p.trim;
  ctx.lineWidth = FRAME_WIDTH;
  for (const board of [0, 1] as const) {
    const r = boardRect(layout, board);
    const inset = FRAME_WIDTH / 2;
    ctx.strokeRect(r.x + inset, r.y + inset, r.w - FRAME_WIDTH, r.h - FRAME_WIDTH);
  }
  ctx.globalAlpha = 1;
}
