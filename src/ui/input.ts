/**
 * Tap-to-place input: select a piece (bench or board), then tap a square on
 * your own board or a bench slot. Tapping two pieces swaps them.
 *
 * The rules live in `tapBenchSlot` and `tapSquare`, which turn a tap into a
 * game intent and the next selection. They contain no DOM code, so they are
 * unit-testable; `attachBoardInput` is the thin pointer-event wrapper.
 */
import type { Pos } from '@sim/board.ts';
import { BOARD, boardCap } from '@sim/data.ts';
import { moveToBenchSlot, placePiece } from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import type { Side } from '@sim/types.ts';
import type { Layout } from './layout.ts';

export interface Selection {
  readonly id: number;
  readonly from: 'bench' | 'board';
}

export interface TapResult {
  readonly selection: Selection | null;
  /** Something to tell the player, or null. */
  readonly message: string | null;
}

const NOTHING: TapResult = { selection: null, message: null };

function ownsSquare(side: Side, pos: Pos): boolean {
  const left = side === 0 ? 0 : BOARD.wallRightX;
  return pos.x >= left && pos.x < left + BOARD.width / 2 && pos.y >= 0 && pos.y < BOARD.height;
}

/** The player tapped a bench slot. */
export function tapBenchSlot(
  game: GameState,
  side: Side,
  selection: Selection | null,
  slot: number,
): TapResult {
  const { holdings } = game.players[side];
  const here = holdings.bench[slot] ?? null;
  if (!selection) {
    return here ? { selection: { id: here.id, from: 'bench' }, message: null } : NOTHING;
  }
  if (here?.id === selection.id) return NOTHING;
  const result = moveToBenchSlot(game, side, selection.id, slot);
  return { selection: null, message: result === 'ok' ? null : 'That piece cannot go there.' };
}

/** The player tapped a world square. */
export function tapSquare(
  game: GameState,
  side: Side,
  selection: Selection | null,
  pos: Pos,
): TapResult {
  const { holdings, econ } = game.players[side];
  const here = holdings.board.find((p) => p.x === pos.x && p.y === pos.y);
  if (!ownsSquare(side, pos)) {
    return selection ? { selection, message: 'Place pieces on your own board.' } : NOTHING;
  }
  if (!selection) {
    return here ? { selection: { id: here.id, from: 'board' }, message: null } : NOTHING;
  }
  if (here?.id === selection.id) return NOTHING;
  const result = placePiece(game, side, selection.id, pos.x, pos.y);
  if (result === 'board-full') {
    const cap = boardCap(econ.level);
    return {
      selection,
      message: `Board is full: level ${String(econ.level)} allows ${String(cap)} pieces.`,
    };
  }
  return { selection: null, message: result === 'ok' ? null : 'That piece cannot go there.' };
}

/** Empty squares on the player's own board to highlight for a selected bench piece. */
export function openSquares(game: GameState, side: Side, selection: Selection | null): Pos[] {
  if (selection?.from !== 'bench') return [];
  const { holdings, econ } = game.players[side];
  if (holdings.board.length >= boardCap(econ.level)) return [];
  const left = side === 0 ? 0 : BOARD.wallRightX;
  const squares: Pos[] = [];
  for (let x = left; x < left + BOARD.width / 2; x++) {
    for (let y = 0; y < BOARD.height; y++) {
      if (!holdings.board.some((p) => p.x === x && p.y === y)) squares.push({ x, y });
    }
  }
  return squares;
}

/**
 * Report taps on the canvas as world squares. Pointer events cover mouse,
 * pen and touch; the layout is read at tap time so rotation is followed.
 */
export function attachBoardInput(
  canvas: HTMLCanvasElement,
  getLayout: () => Layout,
  onTap: (pos: Pos) => void,
): void {
  canvas.addEventListener('pointerup', (event) => {
    const rect = canvas.getBoundingClientRect();
    const pos = getLayout().fromScreen(event.clientX - rect.left, event.clientY - rect.top);
    if (pos) onTap(pos);
  });
}

const ARROW_STEP: Readonly<Record<string, Pos>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Keyboard cursor on the player's own board: arrow keys move it one square and
 * stop at the edge; the first arrow key shows it on the board's first square.
 * Returns null for any other key.
 */
export function moveCursor(cursor: Pos | null, side: Side, key: string): Pos | null {
  const step = ARROW_STEP[key];
  if (!step) return null;
  const left = side === 0 ? 0 : BOARD.wallRightX;
  if (!cursor) return { x: left, y: 0 };
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(cursor.x + step.x, left, left + BOARD.width / 2 - 1),
    y: clamp(cursor.y + step.y, 0, BOARD.height - 1),
  };
}

/** Keys that act like a tap on the cursor square. */
export function isActivateKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

/**
 * Make the canvas keyboard-operable: Tab focuses it, arrows move the cursor
 * (`onCursor`), Enter or Space taps the cursor square (`onTap`).
 */
export function attachBoardKeys(
  canvas: HTMLCanvasElement,
  side: () => Side,
  getCursor: () => Pos | null,
  onCursor: (pos: Pos | null) => void,
  onTap: (pos: Pos) => void,
): void {
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Your board. Arrow keys move the cursor, Enter or Space selects or places a piece.',
  );
  canvas.addEventListener('blur', () => {
    onCursor(null);
  });
  canvas.addEventListener('keydown', (event) => {
    const moved = moveCursor(getCursor(), side(), event.key);
    if (moved) {
      event.preventDefault();
      onCursor(moved);
      return;
    }
    const cursor = getCursor();
    if (cursor && isActivateKey(event.key)) {
      event.preventDefault();
      onTap(cursor);
    }
  });
}
