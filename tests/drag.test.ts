import { describe, expect, it } from 'vitest';

import { BOARD, boardCap } from '@sim/data.ts';
import { createGame } from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import type { PieceType } from '@sim/types.ts';
import { applyDrop, DRAG_THRESHOLD_PX, exceedsDragThreshold } from '../src/ui/drag.ts';
import type { Selection } from '../src/ui/input.ts';

const SEED = 4;
const SIDE = 0;
const OWN = { x: 2, y: 3 };
const ENEMY = { x: BOARD.wallRightX + 2, y: 3 };
const SLOT = 3;

function newGame(): GameState {
  return createGame({ mode: 'ai', seed: SEED });
}

function toBench(game: GameState, slot: number, type: PieceType): Selection {
  const { holdings } = game.players[SIDE];
  const id = holdings.nextId;
  holdings.nextId += 1;
  holdings.bench[slot] = { id, type, stars: 1 };
  return { id, from: 'bench' };
}

function toBoard(game: GameState, x: number, y: number, type: PieceType): Selection {
  const { holdings } = game.players[SIDE];
  const id = holdings.nextId;
  holdings.nextId += 1;
  holdings.board.push({ id, type, stars: 1, x, y });
  return { id, from: 'board' };
}

describe('exceedsDragThreshold', () => {
  it('needs the pointer to travel past the threshold in any direction', () => {
    expect(exceedsDragThreshold(0, 0)).toBe(false);
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX, 0)).toBe(false);
    expect(exceedsDragThreshold(0, -DRAG_THRESHOLD_PX - 1)).toBe(true);
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX, DRAG_THRESHOLD_PX)).toBe(true);
  });
});

describe('applyDrop', () => {
  it('drops a bench piece onto an own-board square', () => {
    const game = newGame();
    const source = toBench(game, 0, 'N');
    const result = applyDrop(game, SIDE, source, { kind: 'square', pos: OWN });
    expect(result).toEqual({ selection: null, message: null });
    expect(game.players[SIDE].holdings.board).toMatchObject([{ id: source.id, ...OWN }]);
  });

  it('drops a board piece onto a bench slot', () => {
    const game = newGame();
    const source = toBoard(game, OWN.x, OWN.y, 'R');
    applyDrop(game, SIDE, source, { kind: 'bench', slot: SLOT });
    const { holdings } = game.players[SIDE];
    expect(holdings.board).toHaveLength(0);
    expect(holdings.bench[SLOT]?.id).toBe(source.id);
  });

  it('drops a bench piece onto another bench slot, swapping', () => {
    const game = newGame();
    const a = toBench(game, 0, 'P');
    const b = toBench(game, SLOT, 'B');
    applyDrop(game, SIDE, a, { kind: 'bench', slot: SLOT });
    const { bench } = game.players[SIDE].holdings;
    expect(bench[SLOT]?.id).toBe(a.id);
    expect(bench[0]?.id).toBe(b.id);
  });

  it('swaps with a piece already on the target square', () => {
    const game = newGame();
    const benched = toBench(game, 0, 'Q');
    const placed = toBoard(game, OWN.x, OWN.y, 'P');
    applyDrop(game, SIDE, benched, { kind: 'square', pos: OWN });
    const { holdings } = game.players[SIDE];
    expect(holdings.board.find((p) => p.id === benched.id)).toMatchObject(OWN);
    expect(holdings.bench[0]?.id).toBe(placed.id);
  });

  it('refuses the opponent’s board and leaves everything where it was', () => {
    const game = newGame();
    const source = toBench(game, 0, 'N');
    const result = applyDrop(game, SIDE, source, { kind: 'square', pos: ENEMY });
    expect(result.message).toMatch(/own board/);
    expect(game.players[SIDE].holdings.board).toHaveLength(0);
    expect(game.players[SIDE].holdings.bench[0]?.id).toBe(source.id);
  });

  it('refuses a drop past the board cap with the cap message', () => {
    const game = newGame();
    const cap = boardCap(game.players[SIDE].econ.level);
    for (let i = 0; i < cap; i++) toBoard(game, i, 0, 'P');
    const source = toBench(game, 0, 'N');
    const result = applyDrop(game, SIDE, source, { kind: 'square', pos: OWN });
    expect(result.message).toContain(`allows ${String(cap)} pieces`);
    expect(game.players[SIDE].holdings.board).toHaveLength(cap);
  });
});
