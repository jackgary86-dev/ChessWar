/**
 * Board geometry and move generation (spec §3.1 and the movement column of §3.2).
 *
 * World grid is 16×8: x 0-7 is Ivory's board (side 0), x 8-15 is Ebony's
 * (side 1); y 0 is rank 8 and y 7 is rank 1. A wall splits x=7 from x=8 and
 * can only be crossed through a portal square. Knights leap the wall anywhere.
 *
 * Move generation only lists squares a piece can walk to; captures are
 * strikes and live in strike generation. Occupied squares are never move
 * targets and always block slides.
 */
import { BOARD, PIECES } from './data.ts';
import type { PieceType, Side } from './types.ts';

export interface Pos {
  readonly x: number;
  readonly y: number;
}

/** Answers whether any piece stands on a square. */
export type Occupied = (pos: Pos) => boolean;

const FILES = 'abcdefghijklmnop';

export const ORTHOGONAL_DIRS: readonly Pos[] = Object.freeze([
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]);

export const DIAGONAL_DIRS: readonly Pos[] = Object.freeze([
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
]);

export const ALL_DIRS: readonly Pos[] = Object.freeze([...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS]);

export const KNIGHT_JUMPS: readonly Pos[] = Object.freeze([
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: 2, y: -1 },
  { x: 1, y: -2 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
  { x: -2, y: 1 },
  { x: -1, y: 2 },
]);

export function inBounds(pos: Pos): boolean {
  return pos.x >= 0 && pos.x < BOARD.width && pos.y >= 0 && pos.y < BOARD.height;
}

export function isPortal(pos: Pos): boolean {
  return BOARD.portals.some((p) => p.x === pos.x && p.y === pos.y);
}

/** Which board a column belongs to. */
export function sideOfX(x: number): Side {
  return x <= BOARD.wallLeftX ? 0 : 1;
}

/** Does a single step between adjacent columns cut across the wall? */
export function crossesWall(from: Pos, to: Pos): boolean {
  return (
    (from.x === BOARD.wallLeftX && to.x === BOARD.wallRightX) ||
    (from.x === BOARD.wallRightX && to.x === BOARD.wallLeftX)
  );
}

/**
 * Is a one-square step legal with respect to the wall? A step across the
 * wall needs its start or end square to be a portal.
 */
export function stepAllowed(from: Pos, to: Pos): boolean {
  return !crossesWall(from, to) || isPortal(from) || isPortal(to);
}

/** Direction of "forward" along x for a side: Ivory moves +x, Ebony −x. */
export function forwardX(side: Side): 1 | -1 {
  return side === 0 ? 1 : -1;
}

/** Algebraic name of a square: files a-p, ranks 1-8 (y 0 is rank 8). */
export function squareName(pos: Pos): string {
  return `${FILES.charAt(pos.x)}${String(BOARD.height - pos.y)}`;
}

/** Inverse of `squareName`, e.g. `parseSquare('h6')`. */
export function parseSquare(name: string): Pos {
  const x = FILES.indexOf(name.charAt(0));
  const rank = Number(name.slice(1));
  const pos = { x, y: BOARD.height - rank };
  if (x < 0 || !Number.isInteger(rank) || !inBounds(pos)) {
    throw new RangeError(`Not a square: ${name}`);
  }
  return pos;
}

function walkable(from: Pos, to: Pos, occupied: Occupied): boolean {
  return inBounds(to) && stepAllowed(from, to) && !occupied(to);
}

function add(pos: Pos, dir: Pos): Pos {
  return { x: pos.x + dir.x, y: pos.y + dir.y };
}

function slideMoves(from: Pos, dirs: readonly Pos[], occupied: Occupied): Pos[] {
  const moves: Pos[] = [];
  for (const dir of dirs) {
    let here = from;
    for (;;) {
      const next = add(here, dir);
      if (!walkable(here, next, occupied)) break;
      moves.push(next);
      here = next;
    }
  }
  return moves;
}

function pawnMoves(from: Pos, side: Side, occupied: Occupied): Pos[] {
  const dx = forwardX(side);
  return [
    { x: dx, y: 0 },
    { x: dx, y: 1 },
    { x: dx, y: -1 },
  ]
    .map((dir) => add(from, dir))
    .filter((to) => walkable(from, to, occupied));
}

function knightMoves(from: Pos, occupied: Occupied): Pos[] {
  return KNIGHT_JUMPS.map((jump) => add(from, jump)).filter((to) => inBounds(to) && !occupied(to));
}

/** Every square a piece of `type` and `side` standing on `from` can move to. */
export function generateMoves(type: PieceType, side: Side, from: Pos, occupied: Occupied): Pos[] {
  switch (type) {
    case 'P':
      return pawnMoves(from, side, occupied);
    case 'N':
      return knightMoves(from, occupied);
    case 'B':
      return slideMoves(from, DIAGONAL_DIRS, occupied);
    case 'R':
      return slideMoves(from, ORTHOGONAL_DIRS, occupied);
    case 'Q':
      return slideMoves(from, ALL_DIRS, occupied);
  }
}

/**
 * Squares a piece can strike from `from`, in line of sight.
 *
 * Fixed patterns (pawn, knight) list every pattern square on the board.
 * Sliding pieces walk each line up to their strike range; the first occupied
 * square is included (it may hold a target) and ends the line, so any piece,
 * friend or foe, blocks sight beyond it. The wall stops non-portal strikes
 * for everything except knights. The caller filters for enemy occupants.
 */
export function generateStrikes(type: PieceType, side: Side, from: Pos, occupied: Occupied): Pos[] {
  switch (type) {
    case 'P': {
      const dx = forwardX(side);
      return [
        { x: dx, y: 0 },
        { x: dx, y: 1 },
        { x: dx, y: -1 },
      ]
        .map((dir) => add(from, dir))
        .filter((to) => inBounds(to) && stepAllowed(from, to));
    }
    case 'N':
      return KNIGHT_JUMPS.map((jump) => add(from, jump)).filter(inBounds);
    case 'B':
      return sliderStrikes(from, DIAGONAL_DIRS, PIECES.B.strikeRange, occupied);
    case 'R':
      return sliderStrikes(from, ORTHOGONAL_DIRS, PIECES.R.strikeRange, occupied);
    case 'Q':
      return sliderStrikes(from, ALL_DIRS, PIECES.Q.strikeRange, occupied);
  }
}

function sliderStrikes(
  from: Pos,
  dirs: readonly Pos[],
  range: number | undefined,
  occupied: Occupied,
): Pos[] {
  const maxSteps = range ?? 0;
  const squares: Pos[] = [];
  for (const dir of dirs) {
    let here = from;
    for (let step = 0; step < maxSteps; step++) {
      const next = add(here, dir);
      if (!inBounds(next) || !stepAllowed(here, next)) break;
      squares.push(next);
      if (occupied(next)) break;
      here = next;
    }
  }
  return squares;
}
