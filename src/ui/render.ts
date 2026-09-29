/**
 * Canvas drawing for the battlefield: boards, wall, portals, bridges, pieces.
 *
 * Reads a `Scene` and draws it; it never touches simulation state. Colors come
 * from CSS custom properties (see theme.css) via `readTheme`. Animation and
 * effects arrive with the combat-animation ticket and feed this renderer
 * interpolated piece positions.
 */
import { BOARD } from '@sim/data.ts';
import type { Pos } from '@sim/board.ts';
import type { PieceType, Side, StarLevel } from '@sim/types.ts';
import type { Effect } from './animation.ts';
import type { Layout } from './layout.ts';

export interface DrawPiece {
  readonly type: PieceType;
  readonly side: Side;
  readonly stars: StarLevel;
  /** World position; may be fractional while a move is animating. */
  readonly x: number;
  readonly y: number;
  /** Current and maximum HP; the bar shows only when `showHp` is set. */
  readonly hp?: number;
  readonly maxHp?: number;
  /** Height above its square in squares, for a knight's hop. */
  readonly lift?: number;
  /** Opacity 0-1 while fading out. */
  readonly alpha?: number;
}

export interface Scene {
  readonly pieces: readonly DrawPiece[];
  readonly showHp: boolean;
  /** Squares to highlight, e.g. open squares while a bench piece is selected. */
  readonly highlights?: readonly Pos[];
  /** Strike lines, floating numbers and death rings, drawn over the pieces. */
  readonly effects?: readonly Effect[];
  /** Square of the selected board piece, outlined in brass. */
  readonly selected?: Pos;
  /** Square under a dragged piece, outlined in green. */
  readonly dropSquare?: Pos;
}

export interface Theme {
  readonly sqLight: readonly [string, string];
  readonly sqDark: readonly [string, string];
  readonly ivory: string;
  readonly ebony: string;
  readonly wall: string;
  readonly portal: string;
  readonly brass: string;
  readonly heal: string;
  readonly crimson: string;
  readonly muted: string;
  readonly pieceFont: string;
}

const THEME_VARS = {
  sqLight1: '--sq-light-1',
  sqDark1: '--sq-dark-1',
  sqLight2: '--sq-light-2',
  sqDark2: '--sq-dark-2',
  ivory: '--ivory',
  ebony: '--ebony',
  wall: '--wall',
  portal: '--portal',
  brass: '--brass',
  heal: '--heal',
  crimson: '--crimson',
  muted: '--muted',
  pieceFont: '--f-piece',
} as const;

export function readTheme(element: Element): Theme {
  const style = getComputedStyle(element);
  const get = (name: string): string => style.getPropertyValue(name).trim();
  return {
    sqLight: [get(THEME_VARS.sqLight1), get(THEME_VARS.sqLight2)],
    sqDark: [get(THEME_VARS.sqDark1), get(THEME_VARS.sqDark2)],
    ivory: get(THEME_VARS.ivory),
    ebony: get(THEME_VARS.ebony),
    wall: get(THEME_VARS.wall),
    portal: get(THEME_VARS.portal),
    brass: get(THEME_VARS.brass),
    heal: get(THEME_VARS.heal),
    crimson: get(THEME_VARS.crimson),
    muted: get(THEME_VARS.muted),
    pieceFont: get(THEME_VARS.pieceFont),
  };
}

/** U+FE0E forces text presentation so glyphs don't render as emoji. */
const TEXT_VS = '︎';
export const PIECE_GLYPH: Readonly<Record<PieceType, string>> = Object.freeze({
  P: `♟${TEXT_VS}`,
  N: `♞${TEXT_VS}`,
  B: `♝${TEXT_VS}`,
  R: `♜${TEXT_VS}`,
  Q: `♛${TEXT_VS}`,
});

const STAR = '★';
const FILES = 'abcdefghijklmnop';

// Drawing proportions, as fractions of one square.
const GLYPH_SIZE = 0.78;
const GLYPH_CENTER_Y = 0.46;
const OUTLINE_WIDTH = 0.05;
const SHADOW_BLUR = 0.12;
const SHADOW_OFFSET = 0.05;
const STAR_SIZE = 0.2;
const STAR_Y = 0.88;
const HP_BAR_HEIGHT = 0.09;
const HP_BAR_WIDTH = 0.7;
const HP_BAR_Y = 0.04;
const LABEL_SIZE = 0.2;
const LABEL_PAD = 0.06;
const LOW_HP = 0.35;
const BRIDGE_HEIGHT = 0.34;
const SELECTION_WIDTH = 0.07;
const HIGHLIGHT_ALPHA = 0.35;
const PORTAL_ALPHA_BASE = 0.55;
const PORTAL_ALPHA_SWING = 0.3;
const PORTAL_PERIOD_MS = 1600;
const TWO_PI = Math.PI * 2;
const SHADOW_COLOR = 'rgba(0,0,0,0.55)';
const RANK_ONE_Y = BOARD.height - 1;
const SECOND_BOARD_X = BOARD.width / 2;

/** Size the canvas for the device pixel ratio so it stays crisp on HiDPI. */
export function fitCanvas(canvas: HTMLCanvasElement, layout: Layout, dpr: number): void {
  canvas.width = Math.round(layout.width * dpr);
  canvas.height = Math.round(layout.height * dpr);
  canvas.style.width = `${String(layout.width)}px`;
  canvas.style.height = `${String(layout.height)}px`;
  canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function drawSquares(ctx: CanvasRenderingContext2D, layout: Layout, theme: Theme): void {
  const { cell } = layout;
  for (let x = 0; x < BOARD.width; x++) {
    const board = x < SECOND_BOARD_X ? 0 : 1;
    for (let y = 0; y < BOARD.height; y++) {
      const dark = (x + y) % 2 === 1;
      ctx.fillStyle = dark ? theme.sqDark[board] : theme.sqLight[board];
      const at = layout.toScreen({ x, y });
      ctx.fillRect(at.x, at.y, cell, cell);
    }
  }
}

function drawWall(ctx: CanvasRenderingContext2D, layout: Layout, theme: Theme): void {
  const first = layout.toScreen({ x: BOARD.wallLeftX, y: 0 });
  const second = layout.toScreen({ x: BOARD.wallRightX, y: 0 });
  ctx.fillStyle = theme.wall;
  if (layout.stacked) {
    ctx.fillRect(0, second.y + layout.cell, layout.width, layout.wallGap);
  } else {
    ctx.fillRect(first.x + layout.cell, 0, layout.wallGap, layout.height);
  }
}

function drawPortals(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: Theme,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const pulse = reducedMotion ? 0 : Math.sin((timeMs / PORTAL_PERIOD_MS) * TWO_PI);
  const alpha = PORTAL_ALPHA_BASE + PORTAL_ALPHA_SWING * pulse;
  const { cell, wallGap } = layout;
  ctx.fillStyle = theme.portal;
  // Bridges span the wall gap between the two portal squares of each rank.
  const bridgeThickness = cell * BRIDGE_HEIGHT;
  const ranks = new Set(BOARD.portals.map((p) => p.y));
  for (const y of ranks) {
    const left = layout.toScreen({ x: BOARD.wallLeftX, y });
    const right = layout.toScreen({ x: BOARD.wallRightX, y });
    ctx.globalAlpha = alpha;
    if (layout.stacked) {
      const top = Math.min(left.y, right.y) + cell;
      ctx.fillRect(left.x + (cell - bridgeThickness) / 2, top, bridgeThickness, wallGap);
    } else {
      ctx.fillRect(left.x + cell, left.y + (cell - bridgeThickness) / 2, wallGap, bridgeThickness);
    }
  }
  for (const p of BOARD.portals) {
    const at = layout.toScreen(p);
    ctx.globalAlpha = alpha;
    ctx.fillRect(at.x, at.y, cell, cell);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.portal;
    ctx.lineWidth = Math.max(1, cell * OUTLINE_WIDTH);
    ctx.strokeRect(at.x + 1, at.y + 1, cell - 2, cell - 2);
  }
  ctx.globalAlpha = 1;
}

function drawNotation(ctx: CanvasRenderingContext2D, layout: Layout, theme: Theme): void {
  const { cell } = layout;
  ctx.font = `600 ${String(Math.round(cell * LABEL_SIZE))}px ${theme.pieceFont}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const pad = cell * LABEL_PAD;
  for (let x = 0; x < BOARD.width; x++) {
    for (let y = 0; y < BOARD.height; y++) {
      const showFile = y === RANK_ONE_Y;
      const showRank = x === 0 || x === SECOND_BOARD_X;
      if (!showFile && !showRank) continue;
      const at = layout.toScreen({ x, y });
      const dark = (x + y) % 2 === 1;
      ctx.fillStyle = dark
        ? theme.sqLight[x < SECOND_BOARD_X ? 0 : 1]
        : theme.sqDark[x < SECOND_BOARD_X ? 0 : 1];
      if (showRank) ctx.fillText(String(BOARD.height - y), at.x + pad, at.y + pad);
      if (showFile) {
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'right';
        ctx.fillText(FILES.charAt(x), at.x + cell - pad, at.y + cell - pad);
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
      }
    }
  }
}

function drawHighlights(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: Theme,
  squares: readonly Pos[],
): void {
  ctx.globalAlpha = HIGHLIGHT_ALPHA;
  ctx.fillStyle = theme.brass;
  for (const pos of squares) {
    const at = layout.toScreen(pos);
    ctx.fillRect(at.x, at.y, layout.cell, layout.cell);
  }
  ctx.globalAlpha = 1;
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  pos: Pos,
  color: string,
): void {
  const at = layout.toScreen(pos);
  const width = Math.max(2, layout.cell * SELECTION_WIDTH);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(at.x + width / 2, at.y + width / 2, layout.cell - width, layout.cell - width);
}

function screenAt(layout: Layout, x: number, y: number): { x: number; y: number } {
  // Bilinear blend of square corners lets fractional positions animate smoothly.
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const base = layout.toScreen({ x: x0, y: y0 });
  const nx = layout.toScreen({ x: x0 + 1, y: y0 });
  const ny = layout.toScreen({ x: x0, y: y0 + 1 });
  const fx = x - x0;
  const fy = y - y0;
  return {
    x: base.x + (nx.x - base.x) * fx + (ny.x - base.x) * fy,
    y: base.y + (nx.y - base.y) * fx + (ny.y - base.y) * fy,
  };
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: Theme,
  piece: DrawPiece,
  showHp: boolean,
): void {
  const { cell } = layout;
  const base = screenAt(layout, piece.x, piece.y);
  const at = { x: base.x, y: base.y - cell * (piece.lift ?? 0) };
  const cx = at.x + cell / 2;
  ctx.globalAlpha = piece.alpha ?? 1;

  ctx.font = `${String(Math.round(cell * GLYPH_SIZE))}px ${theme.pieceFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = cell * OUTLINE_WIDTH;
  ctx.shadowColor = SHADOW_COLOR;
  ctx.shadowBlur = cell * SHADOW_BLUR;
  ctx.shadowOffsetY = cell * SHADOW_OFFSET;
  ctx.strokeStyle = piece.side === 0 ? theme.ebony : theme.ivory;
  ctx.fillStyle = piece.side === 0 ? theme.ivory : theme.ebony;
  const glyphY = at.y + cell * GLYPH_CENTER_Y;
  ctx.strokeText(PIECE_GLYPH[piece.type], cx, glyphY);
  ctx.shadowColor = 'transparent';
  ctx.fillText(PIECE_GLYPH[piece.type], cx, glyphY);

  ctx.font = `${String(Math.round(cell * STAR_SIZE))}px ${theme.pieceFont}`;
  ctx.fillStyle = theme.brass;
  ctx.fillText(STAR.repeat(piece.stars), cx, at.y + cell * STAR_Y);

  if (showHp && piece.hp !== undefined && piece.maxHp !== undefined && piece.maxHp > 0) {
    const ratio = Math.max(0, Math.min(1, piece.hp / piece.maxHp));
    const barW = cell * HP_BAR_WIDTH;
    const barH = Math.max(2, cell * HP_BAR_HEIGHT);
    const barX = cx - barW / 2;
    const barY = at.y + cell * HP_BAR_Y;
    ctx.fillStyle = theme.wall;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = ratio < LOW_HP ? theme.crimson : theme.heal;
    ctx.fillRect(barX, barY, barW * ratio, barH);
  }
  ctx.globalAlpha = 1;
}

const LINE_WIDTH = 0.09;
const LINE_OUTLINE_EXTRA = 0.07;
const FLOAT_RISE = 0.7;
const FLOAT_SIZE = 0.34;
const FLOAT_OUTLINE = 0.08;
const RING_START = 0.25;
const RING_GROWTH = 0.6;
const RING_WIDTH = 0.06;

function centerOf(layout: Layout, pos: Pos): { x: number; y: number } {
  const at = screenAt(layout, pos.x, pos.y);
  return { x: at.x + layout.cell / 2, y: at.y + layout.cell / 2 };
}

function toneColor(theme: Theme, tone: Side | 'heal'): string {
  if (tone === 'heal') return theme.heal;
  return tone === 0 ? theme.ivory : theme.ebony;
}

function drawEffects(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: Theme,
  effects: readonly Effect[],
): void {
  const { cell } = layout;
  ctx.lineCap = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const effect of effects) {
    const fade = 1 - effect.progress;
    ctx.globalAlpha = fade;
    if (effect.kind === 'line') {
      const a = centerOf(layout, effect.from);
      const b = centerOf(layout, effect.to);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      // A contrasting under-stroke keeps an ebony line visible on dark squares.
      ctx.strokeStyle = effect.tone === 1 ? theme.ivory : theme.ebony;
      ctx.lineWidth = cell * (LINE_WIDTH + LINE_OUTLINE_EXTRA);
      ctx.stroke();
      ctx.strokeStyle = toneColor(theme, effect.tone);
      ctx.lineWidth = cell * LINE_WIDTH;
      ctx.stroke();
    } else if (effect.kind === 'float') {
      const c = centerOf(layout, effect.pos);
      const y = c.y - cell * FLOAT_RISE * effect.progress;
      ctx.font = `700 ${String(Math.round(cell * FLOAT_SIZE))}px ${theme.pieceFont}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = cell * FLOAT_OUTLINE;
      ctx.strokeStyle = theme.wall;
      ctx.strokeText(effect.text, c.x, y);
      ctx.fillStyle = effect.tone === 'damage' ? theme.crimson : theme.heal;
      ctx.fillText(effect.text, c.x, y);
    } else {
      const c = centerOf(layout, effect.pos);
      ctx.beginPath();
      ctx.arc(c.x, c.y, cell * (RING_START + RING_GROWTH * effect.progress), 0, TWO_PI);
      ctx.strokeStyle = theme.crimson;
      ctx.lineWidth = cell * RING_WIDTH;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Draw the whole battlefield. `timeMs` drives the portal pulse only. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  theme: Theme,
  scene: Scene,
  timeMs: number,
  reducedMotion: boolean,
): void {
  ctx.clearRect(0, 0, layout.width, layout.height);
  drawSquares(ctx, layout, theme);
  drawWall(ctx, layout, theme);
  drawPortals(ctx, layout, theme, timeMs, reducedMotion);
  drawNotation(ctx, layout, theme);
  if (scene.highlights) drawHighlights(ctx, layout, theme, scene.highlights);
  if (scene.selected) drawSelection(ctx, layout, scene.selected, theme.brass);
  if (scene.dropSquare) drawSelection(ctx, layout, scene.dropSquare, theme.heal);
  for (const piece of scene.pieces) {
    drawPiece(ctx, layout, theme, piece, scene.showHp);
  }
  if (scene.effects) drawEffects(ctx, layout, theme, scene.effects);
}
