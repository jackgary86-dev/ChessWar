/**
 * Movement AI for a piece with no enemy in strike range (spec §3.3).
 *
 * 1. BFS over the piece's own chess move graph, with current occupancy, to the
 *    nearest square from which it could strike an enemy.
 * 2. If no such square is reachable, take the legal move that most reduces the
 *    wall-aware king-step distance to the nearest enemy.
 * 3. If nothing helps, wait (no step).
 *
 * Ties are broken by move-generation order, so results are deterministic.
 */
import { ALL_DIRS, generateMoves, generateStrikes, inBounds, stepAllowed } from './board.ts';
import type { Occupied, Pos } from './board.ts';
import { BOARD } from './data.ts';
import type { PieceType, Side } from './types.ts';

export interface MoverContext {
  readonly type: PieceType;
  readonly side: Side;
  readonly from: Pos;
  /** Any piece, friend or foe, standing on a square (including the mover). */
  readonly occupied: Occupied;
  /** Enemy piece positions. */
  readonly enemies: readonly Pos[];
}

function key(pos: Pos): number {
  return pos.y * BOARD.width + pos.x;
}

function same(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Wall-aware king-step distance from every square to the nearest enemy,
 * ignoring pieces in the way. Indexed by `y * width + x`; unreachable is Infinity.
 */
export function kingStepDistances(enemies: readonly Pos[]): number[] {
  const dist: number[] = Array.from({ length: BOARD.width * BOARD.height }, () => Infinity);
  let frontier: Pos[] = [];
  for (const enemy of enemies) {
    if (inBounds(enemy) && dist[key(enemy)] === Infinity) {
      dist[key(enemy)] = 0;
      frontier.push(enemy);
    }
  }
  while (frontier.length > 0) {
    const nextFrontier: Pos[] = [];
    for (const here of frontier) {
      const d = dist[key(here)] ?? Infinity;
      for (const dir of ALL_DIRS) {
        const there = { x: here.x + dir.x, y: here.y + dir.y };
        if (!inBounds(there) || !stepAllowed(here, there) || dist[key(there)] !== Infinity) {
          continue;
        }
        dist[key(there)] = d + 1;
        nextFrontier.push(there);
      }
    }
    frontier = nextFrontier;
  }
  return dist;
}

/**
 * Shortest path (excluding the start square) to the nearest square from which
 * the piece could strike an enemy. Empty when none is reachable.
 */
export function findStrikePath(ctx: MoverContext): Pos[] {
  const { type, side, from, enemies } = ctx;
  // Once the mover leaves, its own square is empty.
  const occupied: Occupied = (p) => !same(p, from) && ctx.occupied(p);
  const enemyKeys = new Set(enemies.map(key));
  const canStrikeFrom = (square: Pos): boolean =>
    generateStrikes(type, side, square, occupied).some((s) => enemyKeys.has(key(s)));

  const parent = new Map<number, Pos>();
  const seen = new Set<number>([key(from)]);
  let frontier: Pos[] = [from];
  while (frontier.length > 0) {
    const nextFrontier: Pos[] = [];
    for (const here of frontier) {
      for (const there of generateMoves(type, side, here, occupied)) {
        if (seen.has(key(there))) continue;
        seen.add(key(there));
        parent.set(key(there), here);
        if (canStrikeFrom(there)) {
          const path: Pos[] = [there];
          let back = here;
          while (!same(back, from)) {
            path.unshift(back);
            back = parent.get(key(back)) ?? from;
          }
          return path;
        }
        nextFrontier.push(there);
      }
    }
    frontier = nextFrontier;
  }
  return [];
}

/** Fallback: the legal move that strictly reduces king-step distance the most. */
export function findApproachMove(ctx: MoverContext): Pos | null {
  const dist = kingStepDistances(ctx.enemies);
  const occupied: Occupied = (p) => !same(p, ctx.from) && ctx.occupied(p);
  let best: Pos | null = null;
  let bestDist = dist[key(ctx.from)] ?? Infinity;
  for (const move of generateMoves(ctx.type, ctx.side, ctx.from, occupied)) {
    const d = dist[key(move)] ?? Infinity;
    if (d < bestDist) {
      best = move;
      bestDist = d;
    }
  }
  return best;
}

/** The square to move to this action, or null to wait a tick. */
export function findStep(ctx: MoverContext): Pos | null {
  return findStrikePath(ctx)[0] ?? findApproachMove(ctx);
}
