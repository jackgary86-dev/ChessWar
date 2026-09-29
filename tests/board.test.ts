import { describe, expect, it } from 'vitest';

import { generateMoves, generateStrikes, isPortal, parseSquare, squareName } from '@sim/board.ts';
import type { Occupied, Pos } from '@sim/board.ts';
import type { PieceType, Side } from '@sim/types.ts';

const EMPTY: Occupied = () => false;

function movesFrom(
  type: PieceType,
  square: string,
  opts: { side?: Side; blockers?: string[] } = {},
): string[] {
  const blocked = new Set((opts.blockers ?? []).map((s) => squareName(parseSquare(s))));
  const occupied: Occupied = (p: Pos) => blocked.has(squareName(p));
  return generateMoves(type, opts.side ?? 0, parseSquare(square), occupied).map(squareName);
}

describe('square naming', () => {
  it('round-trips and puts portals on h6, h3, i6, i3', () => {
    expect(squareName(parseSquare('a8'))).toBe('a8');
    expect(squareName(parseSquare('p1'))).toBe('p1');
    for (const s of ['h6', 'h3', 'i6', 'i3']) expect(isPortal(parseSquare(s))).toBe(true);
    expect(isPortal(parseSquare('h5'))).toBe(false);
    expect(() => parseSquare('q1')).toThrow(RangeError);
    expect(() => parseSquare('a9')).toThrow(RangeError);
  });
});

describe('wall and portal rules', () => {
  it('a rook on h5 cannot slide to i5', () => {
    const moves = movesFrom('R', 'h5');
    expect(moves).not.toContain('i5');
    expect(moves.some((m) => m.charCodeAt(0) > 'h'.charCodeAt(0) && m[1] === '5')).toBe(false);
  });

  it('a rook on h6 slides through the portal to i6 and beyond', () => {
    const moves = movesFrom('R', 'h6');
    for (const s of ['i6', 'j6', 'k6', 'p6']) expect(moves).toContain(s);
  });

  it('a rook cannot cross the wall while another piece blocks the portal square', () => {
    expect(movesFrom('R', 'h6', { blockers: ['i6'] })).not.toContain('j6');
  });

  it('a rook sliding along a file onto the portal cannot continue across the wall', () => {
    // g6 -> h6 is fine (no wall); the slide east then crosses via the portal.
    const moves = movesFrom('R', 'g6');
    expect(moves).toContain('h6');
    expect(moves).toContain('i6');
    expect(movesFrom('R', 'g5')).not.toContain('i5');
  });

  it('a bishop can enter from g7 to h6 (portal) to i5', () => {
    const moves = movesFrom('B', 'g7');
    expect(moves).toContain('h6');
    expect(moves).toContain('i5');
    expect(moves).toContain('j4');
  });

  it('a bishop cannot cross the wall away from a portal', () => {
    // g6 -> h5 -> i4 would cross between h5 and i4, neither is a portal.
    const moves = movesFrom('B', 'g6');
    expect(moves).toContain('h5');
    expect(moves).not.toContain('i4');
  });

  it('a knight on g4 can jump to i5', () => {
    expect(movesFrom('N', 'g4')).toContain('i5');
  });

  it('knights leap the wall anywhere and are not blocked by pieces in between', () => {
    const moves = movesFrom('N', 'h1', { blockers: ['h2', 'i1', 'i2'] });
    expect(moves).toContain('j2');
  });

  it('a queen obeys the wall on every slide', () => {
    const moves = movesFrom('Q', 'h5');
    expect(moves).not.toContain('i5');
    expect(moves).toContain('i6');
    expect(moves).not.toContain('i4');
  });

  it('a pawn stepping straight or diagonally across the wall needs a portal', () => {
    // From h5 only the diagonal onto portal i6 is legal.
    expect(movesFrom('P', 'h5', { side: 0 })).toEqual(['i6']);
    const viaPortal = movesFrom('P', 'h6', { side: 0 });
    expect(viaPortal.sort()).toEqual(['i5', 'i6', 'i7']);
    // From h7 the diagonal lands on portal i6; straight to i7 is not legal.
    const diagonalOnly = movesFrom('P', 'h7', { side: 0 });
    expect(diagonalOnly).toEqual(['i6']);
  });
});

describe('pawn direction', () => {
  it('a Player 1 pawn only moves toward +x', () => {
    const moves = movesFrom('P', 'c4', { side: 0 });
    expect(moves.sort()).toEqual(['d3', 'd4', 'd5']);
  });

  it('a Player 2 pawn only moves toward −x', () => {
    const moves = movesFrom('P', 'n4', { side: 1 });
    expect(moves.sort()).toEqual(['m3', 'm4', 'm5']);
  });

  it('pawns cannot move onto occupied squares', () => {
    const moves = movesFrom('P', 'c4', { side: 0, blockers: ['d4', 'd5'] });
    expect(moves).toEqual(['d3']);
  });

  it('pawns cannot leave the board', () => {
    expect(movesFrom('P', 'p4', { side: 0 })).toEqual([]);
    expect(movesFrom('P', 'a4', { side: 1 })).toEqual([]);
  });
});

describe('piece move shapes', () => {
  it('knights have up to 8 jumps and stay on the board', () => {
    expect(generateMoves('N', 0, parseSquare('d4'), EMPTY)).toHaveLength(8);
    expect(movesFrom('N', 'a1').sort()).toEqual(['b3', 'c2']);
  });

  it('bishops slide diagonally any distance and stop at blockers', () => {
    const moves = movesFrom('B', 'a1', { blockers: ['d4'] });
    expect(moves.sort()).toEqual(['b2', 'c3']);
  });

  it('rooks slide orthogonally and stop at blockers', () => {
    const moves = movesFrom('R', 'a1', { blockers: ['a4', 'c1'] });
    expect(moves.sort()).toEqual(['a2', 'a3', 'b1']);
  });

  it('queens combine rook and bishop moves', () => {
    const all = generateMoves('Q', 0, parseSquare('b2'), EMPTY);
    const rook = generateMoves('R', 0, parseSquare('b2'), EMPTY);
    const bishop = generateMoves('B', 0, parseSquare('b2'), EMPTY);
    expect(all).toHaveLength(rook.length + bishop.length);
  });
});

describe('strike generation', () => {
  function strikesFrom(
    type: PieceType,
    square: string,
    opts: { side?: Side; blockers?: string[] } = {},
  ): string[] {
    const blocked = new Set(opts.blockers ?? []);
    const occupied: Occupied = (p: Pos) => blocked.has(squareName(p));
    return generateStrikes(type, opts.side ?? 0, parseSquare(square), occupied)
      .map(squareName)
      .sort();
  }

  it('pawns strike the 3 squares ahead for each side', () => {
    expect(strikesFrom('P', 'c4', { side: 0 })).toEqual(['d3', 'd4', 'd5']);
    expect(strikesFrom('P', 'n4', { side: 1 })).toEqual(['m3', 'm4', 'm5']);
  });

  it('pawn strikes respect the wall unless a portal is involved', () => {
    expect(strikesFrom('P', 'h5', { side: 0 })).toEqual(['i6']);
    expect(strikesFrom('P', 'h6', { side: 0 })).toEqual(['i5', 'i6', 'i7']);
    expect(strikesFrom('P', 'i5', { side: 1 })).toEqual(['h6']);
  });

  it('knights strike knight squares, over the wall and over pieces', () => {
    const squares = strikesFrom('N', 'g4', { blockers: ['h4', 'h5', 'g5'] });
    expect(squares).toContain('i5');
    expect(squares).toHaveLength(8);
    expect(strikesFrom('N', 'a1')).toEqual(['b3', 'c2']);
  });

  it('slider range is capped at 3', () => {
    expect(strikesFrom('R', 'a8')).toEqual(['a5', 'a6', 'a7', 'b8', 'c8', 'd8']);
    expect(strikesFrom('B', 'a8')).toEqual(['b7', 'c6', 'd5']);
    expect(strikesFrom('Q', 'a8')).toEqual(['a5', 'a6', 'a7', 'b7', 'b8', 'c6', 'c8', 'd5', 'd8']);
  });

  it('the first piece, friend or foe, blocks line of sight beyond it', () => {
    expect(strikesFrom('R', 'a8', { blockers: ['c8', 'a6'] })).toEqual(['a6', 'a7', 'b8', 'c8']);
    expect(strikesFrom('B', 'a8', { blockers: ['b7'] })).toEqual(['b7']);
  });

  it('the wall blocks non-portal strikes and portals let them through', () => {
    expect(strikesFrom('R', 'h5')).not.toContain('i5');
    expect(strikesFrom('R', 'h5')).toEqual(['e5', 'f5', 'g5', 'h2', 'h3', 'h4', 'h6', 'h7', 'h8']);
    expect(strikesFrom('R', 'h6')).toEqual(expect.arrayContaining(['i6', 'j6', 'k6']));
    expect(strikesFrom('R', 'h6')).not.toContain('l6');
    expect(strikesFrom('B', 'g7')).toEqual(expect.arrayContaining(['h6', 'i5']));
    expect(strikesFrom('B', 'g7')).toContain('j4');
    expect(strikesFrom('B', 'g7')).not.toContain('k3');
  });
});

describe('move ordering', () => {
  it('each side lists its own forward direction first, so ties favour neither', () => {
    // Ivory rook on d4: first slide goes east; Ebony rook on m4: first slide goes west.
    expect(movesFrom('R', 'd4', { side: 0 })[0]).toBe('e4');
    expect(movesFrom('R', 'm4', { side: 1 })[0]).toBe('l4');
    expect(movesFrom('N', 'd4', { side: 0 })[0]?.charCodeAt(0)).toBeGreaterThan('d'.charCodeAt(0));
    expect(movesFrom('N', 'm4', { side: 1 })[0]?.charCodeAt(0)).toBeLessThan('m'.charCodeAt(0));
  });
});
