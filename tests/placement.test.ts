import { describe, expect, it } from 'vitest';

import { BOARD, PLAYER, boardCap } from '@sim/data.ts';
import { createGame, moveToBenchSlot, ready } from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import type { PieceType, Side, StarLevel } from '@sim/types.ts';
import { openSquares, tapBenchSlot, tapSquare } from '../src/ui/input.ts';
import type { Selection } from '../src/ui/input.ts';

const SEED = 9;
const HUMAN: Side = 0;
const OWN = { x: 2, y: 3 };
const OTHER_OWN = { x: 3, y: 3 };
const ENEMY = { x: BOARD.wallRightX + 1, y: 3 };
const BENCH_SLOT = 0;
const OTHER_SLOT = 4;

function newGame(): GameState {
  return createGame({ mode: 'ai', seed: SEED });
}

function toBench(game: GameState, slot: number, type: PieceType, stars: StarLevel = 1): number {
  const { holdings } = game.players[HUMAN];
  const id = holdings.nextId;
  holdings.nextId += 1;
  holdings.bench[slot] = { id, type, stars };
  return id;
}

function toBoard(game: GameState, x: number, y: number, type: PieceType = 'P'): number {
  const { holdings } = game.players[HUMAN];
  const id = holdings.nextId;
  holdings.nextId += 1;
  holdings.board.push({ id, type, stars: 1, x, y });
  return id;
}

const fromBench = (id: number): Selection => ({ id, from: 'bench' });
const fromBoard = (id: number): Selection => ({ id, from: 'board' });

describe('tap a bench piece, then a square', () => {
  it('selects the bench piece and highlights open squares on the own board only', () => {
    const game = newGame();
    const id = toBench(game, BENCH_SLOT, 'N');
    toBoard(game, OWN.x, OWN.y);
    const { selection } = tapBenchSlot(game, HUMAN, null, BENCH_SLOT);
    expect(selection).toEqual(fromBench(id));
    const open = openSquares(game, HUMAN, selection);
    expect(open).toHaveLength((BOARD.width / 2) * BOARD.height - 1);
    expect(open.every((p) => p.x < BOARD.wallRightX)).toBe(true);
    expect(open).not.toContainEqual(OWN);
  });

  it('places the piece on the tapped square', () => {
    const game = newGame();
    const id = toBench(game, BENCH_SLOT, 'N');
    const result = tapSquare(game, HUMAN, fromBench(id), OWN);
    expect(result).toEqual({ selection: null, message: null });
    expect(game.players[HUMAN].holdings.board).toMatchObject([{ id, x: OWN.x, y: OWN.y }]);
    expect(game.players[HUMAN].holdings.bench[BENCH_SLOT]).toBeNull();
  });

  it('refuses the opponent’s board and keeps the selection', () => {
    const game = newGame();
    const id = toBench(game, BENCH_SLOT, 'N');
    const result = tapSquare(game, HUMAN, fromBench(id), ENEMY);
    expect(result.selection).toEqual(fromBench(id));
    expect(result.message).toMatch(/own board/);
    expect(game.players[HUMAN].holdings.board).toHaveLength(0);
  });

  it('blocks placement past the board cap with a clear message and no open squares', () => {
    const game = newGame();
    const cap = boardCap(game.players[HUMAN].econ.level);
    for (let i = 0; i < cap; i++) toBoard(game, i, 0);
    const id = toBench(game, BENCH_SLOT, 'N');
    expect(openSquares(game, HUMAN, fromBench(id))).toEqual([]);
    const result = tapSquare(game, HUMAN, fromBench(id), OWN);
    expect(result.message).toContain(`allows ${String(cap)} pieces`);
    expect(result.selection).toEqual(fromBench(id));
    expect(game.players[HUMAN].holdings.board).toHaveLength(cap);
  });
});

describe('swapping and moving', () => {
  it('swaps two board pieces when a piece is selected and another is tapped', () => {
    const game = newGame();
    const a = toBoard(game, OWN.x, OWN.y, 'R');
    const b = toBoard(game, OTHER_OWN.x, OTHER_OWN.y, 'Q');
    const picked = tapSquare(game, HUMAN, null, OWN).selection;
    expect(picked).toEqual(fromBoard(a));
    tapSquare(game, HUMAN, picked, OTHER_OWN);
    const board = game.players[HUMAN].holdings.board;
    expect(board.find((p) => p.id === a)).toMatchObject(OTHER_OWN);
    expect(board.find((p) => p.id === b)).toMatchObject(OWN);
  });

  it('swaps a bench piece with a board piece even at the board cap', () => {
    const game = newGame();
    const cap = boardCap(game.players[HUMAN].econ.level);
    const onBoard = toBoard(game, OWN.x, OWN.y);
    for (let i = 1; i < cap; i++) toBoard(game, i + OWN.x, 0);
    const benched = toBench(game, BENCH_SLOT, 'Q');
    tapSquare(game, HUMAN, fromBench(benched), OWN);
    const { holdings } = game.players[HUMAN];
    expect(holdings.board).toHaveLength(cap);
    expect(holdings.board.find((p) => p.id === benched)).toMatchObject(OWN);
    expect(holdings.bench[BENCH_SLOT]?.id).toBe(onBoard);
  });

  it('tapping the selected piece again deselects it', () => {
    const game = newGame();
    const id = toBoard(game, OWN.x, OWN.y);
    expect(tapSquare(game, HUMAN, fromBoard(id), OWN).selection).toBeNull();
    const benchId = toBench(game, BENCH_SLOT, 'B');
    expect(tapBenchSlot(game, HUMAN, fromBench(benchId), BENCH_SLOT).selection).toBeNull();
  });

  it('moves a board piece to a chosen bench slot, and a bench piece between slots', () => {
    const game = newGame();
    const boardId = toBoard(game, OWN.x, OWN.y);
    tapBenchSlot(game, HUMAN, fromBoard(boardId), OTHER_SLOT);
    const { holdings } = game.players[HUMAN];
    expect(holdings.board).toHaveLength(0);
    expect(holdings.bench[OTHER_SLOT]?.id).toBe(boardId);
    tapBenchSlot(game, HUMAN, fromBench(boardId), BENCH_SLOT);
    expect(holdings.bench[BENCH_SLOT]?.id).toBe(boardId);
    expect(holdings.bench[OTHER_SLOT]).toBeNull();
  });

  it('swaps a bench piece with an occupied bench slot', () => {
    const game = newGame();
    const a = toBench(game, BENCH_SLOT, 'P');
    const b = toBench(game, OTHER_SLOT, 'N');
    tapBenchSlot(game, HUMAN, fromBench(a), OTHER_SLOT);
    const { bench } = game.players[HUMAN].holdings;
    expect(bench[OTHER_SLOT]?.id).toBe(a);
    expect(bench[BENCH_SLOT]?.id).toBe(b);
  });

  it('a board piece dropped on an occupied bench slot swaps with it', () => {
    const game = newGame();
    const onBoard = toBoard(game, OWN.x, OWN.y);
    const benched = toBench(game, BENCH_SLOT, 'N');
    tapBenchSlot(game, HUMAN, fromBoard(onBoard), BENCH_SLOT);
    const { holdings } = game.players[HUMAN];
    expect(holdings.bench[BENCH_SLOT]?.id).toBe(onBoard);
    expect(holdings.board).toMatchObject([{ id: benched, x: OWN.x, y: OWN.y }]);
  });
});

describe('moveToBenchSlot', () => {
  it('rejects bad slots, unknown pieces and the wrong phase', () => {
    const game = newGame();
    const id = toBench(game, BENCH_SLOT, 'P');
    expect(moveToBenchSlot(game, HUMAN, id, PLAYER.benchSize)).toBe('invalid');
    expect(moveToBenchSlot(game, HUMAN, id, -1)).toBe('invalid');
    expect(moveToBenchSlot(game, HUMAN, 9999, 1)).toBe('invalid');
    ready(game);
    expect(moveToBenchSlot(game, HUMAN, id, 1)).toBe('wrong-phase');
  });
});
