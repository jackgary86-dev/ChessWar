/**
 * Canvas layout and input mapping for the 16×8 battlefield.
 *
 * On wide screens the boards sit side by side (world x runs left to right).
 * On narrow screens the view rotates a quarter turn so the boards stack
 * vertically with Ivory (Player 1) at the bottom: world x runs bottom to top
 * and world y runs left to right. `toScreen` and `fromScreen` are exact
 * inverses in both orientations, so pointer input follows the rotation.
 *
 * Pure geometry only: no DOM access, so it is unit-testable.
 */
import { BOARD } from '@sim/data.ts';
import type { Pos } from '@sim/board.ts';

/** Viewport width (CSS px) under which the boards stack vertically. */
export const STACK_BREAKPOINT_PX = 620;

/** The wall gap as a fraction of one square. */
const WALL_GAP_RATIO = 0.3;
const HALF_BOARD = BOARD.width / 2;

export interface Layout {
  readonly stacked: boolean;
  /** Side length of one square in CSS px. */
  readonly cell: number;
  /** Width of the wall gap in CSS px. */
  readonly wallGap: number;
  /** Canvas size in CSS px. */
  readonly width: number;
  readonly height: number;
  /** Top-left corner of a world square on the canvas. */
  toScreen: (pos: Pos) => { readonly x: number; readonly y: number };
  /** World square under a canvas point, or null over the wall or outside. */
  fromScreen: (px: number, py: number) => Pos | null;
}

export function shouldStack(viewportWidth: number): boolean {
  return viewportWidth < STACK_BREAKPOINT_PX;
}

/** Fit the battlefield inside `maxWidth`×`maxHeight` CSS px. */
export function computeLayout(maxWidth: number, maxHeight: number, stacked: boolean): Layout {
  const majorSquares = BOARD.width;
  const minorSquares = BOARD.height;
  const cols = stacked ? minorSquares : majorSquares;
  const rows = stacked ? majorSquares : minorSquares;
  const gapSquares = WALL_GAP_RATIO;
  const cell = Math.floor(
    Math.min(
      maxWidth / (cols + (stacked ? 0 : gapSquares)),
      maxHeight / (rows + (stacked ? gapSquares : 0)),
    ),
  );
  const wallGap = Math.round(cell * WALL_GAP_RATIO);
  const major = majorSquares * cell + wallGap;
  const minor = minorSquares * cell;

  // Distance along the long axis. Index 0 is the first displayed square.
  const majorOffset = (index: number): number => index * cell + (index >= HALF_BOARD ? wallGap : 0);
  const displayIndex = (x: number): number => (stacked ? BOARD.width - 1 - x : x);

  const toScreen = (pos: Pos): { x: number; y: number } => {
    const along = majorOffset(displayIndex(pos.x));
    const across = pos.y * cell;
    return stacked ? { x: across, y: along } : { x: along, y: across };
  };

  const fromScreen = (px: number, py: number): Pos | null => {
    const along = stacked ? py : px;
    const across = stacked ? px : py;
    const row = Math.floor(across / cell);
    if (across < 0 || row >= minorSquares || along < 0 || along >= major) return null;
    const firstBoardEnd = HALF_BOARD * cell;
    if (along >= firstBoardEnd && along < firstBoardEnd + wallGap) return null;
    const index = Math.floor((along - (along >= firstBoardEnd ? wallGap : 0)) / cell);
    const x = stacked ? BOARD.width - 1 - index : index;
    return { x, y: row };
  };

  return {
    stacked,
    cell,
    wallGap,
    width: stacked ? minor : major,
    height: stacked ? major : minor,
    toScreen,
    fromScreen,
  };
}
