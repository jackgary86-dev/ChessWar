import { describe, expect, it } from 'vitest';

import { parseSquare, squareName } from '@sim/board.ts';
import type { Pos } from '@sim/board.ts';
import { findApproachMove, findStep, findStrikePath, kingStepDistances } from '@sim/pathfinding.ts';
import type { MoverContext } from '@sim/pathfinding.ts';
import type { PieceType, Side } from '@sim/types.ts';

function ctx(
  type: PieceType,
  side: Side,
  from: string,
  enemies: string[],
  friends: string[] = [],
): MoverContext {
  const occupiedNames = new Set([from, ...enemies, ...friends]);
  return {
    type,
    side,
    from: parseSquare(from),
    occupied: (p: Pos) => occupiedNames.has(squareName(p)),
    enemies: enemies.map(parseSquare),
  };
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}

const names = (path: readonly Pos[]): string[] => path.map(squareName);

describe('pathfinding', () => {
  it('a rook routes through a portal row', () => {
    // Row 5 is walled off, so the rook must use rank 3 or 6 to get across.
    const path = findStrikePath(ctx('R', 0, 'f5', ['m5']));
    expect(path).toHaveLength(2);
    expect(['f3', 'f6']).toContain(squareName(must(path[0])));
    // The second leg slides across the wall along the same portal rank.
    const [first, last] = path as [Pos, Pos];
    expect(last.x).toBeGreaterThanOrEqual(8);
    expect(squareName(first).slice(1)).toBe(squareName(last).slice(1));
  });

  it('a bishop crosses via a portal diagonal', () => {
    // f8 -> g7 -> h6 (portal) -> i5: h6 already strikes the enemy on k3.
    const path = findStrikePath(ctx('B', 0, 'f8', ['k3']));
    expect(names(path)).toEqual(['h6']);
  });

  it('a bishop with no path over the wall still finds one through a portal', () => {
    const path = findStrikePath(ctx('B', 0, 'c6', ['n5']));
    expect(path.length).toBeGreaterThan(0);
    const last = must(path[path.length - 1]);
    expect(last.x).toBeGreaterThanOrEqual(8);
  });

  it('a blocked pawn waits', () => {
    const friends = ['d3', 'd4', 'd5'];
    expect(findStep(ctx('P', 0, 'c4', ['n4'], friends))).toBeNull();
  });

  it('a pawn facing away from every enemy waits', () => {
    expect(findStep(ctx('P', 0, 'c4', ['a4']))).toBeNull();
  });

  it('a pawn walks toward an enemy it can reach', () => {
    const step = findStep(ctx('P', 0, 'a4', ['e4']));
    expect(step).not.toBeNull();
    expect(must(step).x).toBe(1);
  });

  it('falls back to the move that most reduces king-step distance', () => {
    // A bishop can never strike a square of the other colour.
    const c = ctx('B', 0, 'a1', ['h1']);
    expect(findStrikePath(c)).toEqual([]);
    expect(squareName(must(findApproachMove(c)))).toBe('d4');
    expect(squareName(must(findStep(c)))).toBe('d4');
  });

  it('waits when no move reduces the distance', () => {
    expect(findApproachMove(ctx('B', 0, 'a1', ['b1']))).toBeNull();
  });

  it('measures king-step distance around the wall', () => {
    const dist = kingStepDistances([parseSquare('i5')]);
    const at = (s: string): number => {
      const p = parseSquare(s);
      return must(dist[p.y * 16 + p.x]);
    };
    expect(at('i5')).toBe(0);
    expect(at('i4')).toBe(1);
    // h5 is next to i5 on the map but the wall blocks a step: go via portal h6.
    expect(at('h6')).toBe(1);
    expect(at('h5')).toBe(2);
    // g5 reaches h6 diagonally, then i5.
    expect(at('g5')).toBe(2);
    expect(at('f5')).toBe(3);
  });
});
