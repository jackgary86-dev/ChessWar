import { describe, expect, it } from 'vitest';

import { createAiPrep, placeArmy, prepAi, targetLevel } from '@sim/ai.ts';
import {
  AI_DIFFICULTY,
  BOARD,
  PIECES,
  PIECE_ORDER,
  PLAYER,
  POOL_SIZE,
  boardCap,
  copiesForStars,
} from '@sim/data.ts';
import type { AiDifficulty } from '@sim/data.ts';
import { confirmHandoff, createGame, nextRound, ready, skipCombat } from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import { poolTotal } from '@sim/shop.ts';
import type { PieceType, Side, StarLevel } from '@sim/types.ts';

const SEED = 33;
const MAX_ROUNDS = 100;
const DIFFICULTIES: readonly AiDifficulty[] = ['easy', 'normal', 'hard'];
const TOTAL_COPIES = PIECE_ORDER.reduce((sum, type) => sum + POOL_SIZE[type], 0);

function newGame(): GameState {
  return createGame({ mode: 'ai', seed: SEED });
}

function give(game: GameState, side: Side, type: PieceType, stars: StarLevel = 1): void {
  const { holdings } = game.players[side];
  const slot = holdings.bench.indexOf(null);
  holdings.bench[slot] = { id: holdings.nextId, type, stars };
  holdings.nextId += 1;
}

function copies(game: GameState): number {
  return game.players.reduce(
    (sum, p) =>
      sum +
      [...p.holdings.board, ...p.holdings.bench.filter((b) => b !== null)].reduce(
        (n, piece) => n + copiesForStars(piece.stars),
        0,
      ) +
      p.shop.slots.filter((c) => c !== null).length,
    poolTotal(game.pool),
  );
}

describe('target level', () => {
  it('follows min(8, 2 + floor((round+1)/2)) and lags on easy', () => {
    const normal = AI_DIFFICULTY.normal;
    expect([1, 2, 3, 5, 9, 20].map((r) => targetLevel(r, normal))).toEqual([3, 3, 4, 5, 7, 8]);
    expect(targetLevel(5, AI_DIFFICULTY.easy)).toBe(4);
    expect(targetLevel(1, AI_DIFFICULTY.easy)).toBe(PLAYER.minLevel);
  });
});

describe('shopping', () => {
  it('buys a card matching a piece it owns before a more expensive one', () => {
    const game = newGame();
    const ai = game.players[1];
    give(game, 1, 'P');
    ai.shop.slots = ['Q', 'P', null, null, null];
    ai.econ.gold = 9;
    ai.econ.level = 5; // no XP purchases; army not yet full
    prepAi(game, 1);
    const all = [...ai.holdings.board, ...ai.holdings.bench.filter((b) => b !== null)];
    expect(all.filter((p) => p.type === 'P').length).toBeGreaterThanOrEqual(2);
  });

  it('buys XP while below the target level', () => {
    const game = newGame();
    game.round = 5; // target level 5
    const ai = game.players[1];
    ai.shop.slots = [null, null, null, null, null];
    ai.econ.gold = 8;
    prepAi(game, 1);
    expect(ai.econ.level).toBeGreaterThan(2);
    expect(ai.econ.gold).toBeLessThanOrEqual(0 + 8 - 4);
  });

  it('keeps 10 gold for interest from round 6 once its army is full', () => {
    const game = newGame();
    game.round = 6;
    const ai = game.players[1];
    ai.econ.level = 6; // target level for round 6 is 5, so no XP buying
    for (let i = 0; i < 6; i++) give(game, 1, 'P');
    ai.shop.slots = ['R', 'R', null, null, null];
    ai.econ.gold = 12;
    prepAi(game, 1);
    expect(ai.econ.gold).toBe(12);
  });

  it('never spends more than it has', () => {
    for (const difficulty of DIFFICULTIES) {
      const game = newGame();
      game.players[1].econ.gold = 7;
      prepAi(game, 1, difficulty);
      expect(game.players[1].econ.gold).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('placement', () => {
  function armyOf(...types: PieceType[]): GameState {
    const game = newGame();
    game.players[1].econ.level = 8;
    for (const t of types) give(game, 1, t);
    return game;
  }

  it('puts pawns on the portal lanes and each type in its band (Ebony)', () => {
    const game = armyOf('B', 'Q', 'R', 'N', 'P', 'P');
    placeArmy(game, 1, AI_DIFFICULTY.normal);
    const board = game.players[1].holdings.board;
    const at = (type: PieceType): number[] => board.filter((p) => p.type === type).map((p) => p.x);
    // Ebony's file next to the wall is x=8; depth grows toward x=15.
    const pawns = board.filter((p) => p.type === 'P');
    expect(pawns.map((p) => [p.x, p.y]).sort()).toEqual([
      [BOARD.wallRightX + 1, 2],
      [BOARD.wallRightX + 1, 5],
    ]);
    expect(Math.max(...at('P'))).toBeLessThan(Math.min(...at('N')));
    expect(Math.max(...at('N'))).toBeLessThan(Math.min(...at('R')));
    expect(Math.min(...at('B'))).toBeGreaterThan(Math.max(...at('R')));
    for (const p of board) expect(p.x).toBeGreaterThanOrEqual(BOARD.wallRightX);
  });

  it('mirrors the formation for Ivory', () => {
    const game = newGame();
    game.players[0].econ.level = 8;
    for (const t of ['P', 'P', 'N'] as const) give(game, 0, t);
    placeArmy(game, 0, AI_DIFFICULTY.normal);
    const pawns = game.players[0].holdings.board.filter((p) => p.type === 'P');
    expect(pawns.map((p) => [p.x, p.y]).sort()).toEqual([
      [BOARD.wallLeftX - 1, 2],
      [BOARD.wallLeftX - 1, 5],
    ]);
  });

  it('fields its most valuable pieces up to the level cap, benches the rest', () => {
    const game = newGame();
    const ai = game.players[1];
    for (const t of ['P', 'P', 'Q', 'R', 'N'] as const) give(game, 1, t);
    placeArmy(game, 1, AI_DIFFICULTY.normal);
    expect(ai.holdings.board.map((p) => p.type).sort()).toEqual(['Q', 'R']);
    expect(ai.holdings.board).toHaveLength(boardCap(ai.econ.level));
    expect(ai.holdings.bench.filter((b) => b !== null)).toHaveLength(3);
  });

  it('sells pieces that do not fit on the bench and returns them to the pool', () => {
    const game = newGame();
    const ai = game.players[1];
    ai.econ.gold = 0;
    const pool = poolTotal(game.pool);
    const extra = PLAYER.benchSize + boardCap(ai.econ.level) + 2;
    for (let i = 0; i < extra; i++) {
      ai.holdings.board.push({ id: 100 + i, type: 'P', stars: 1, x: 9, y: i % 8 });
    }
    placeArmy(game, 1, AI_DIFFICULTY.normal);
    expect(ai.holdings.board.length + ai.holdings.bench.filter((b) => b !== null).length).toBe(
      boardCap(ai.econ.level) + PLAYER.benchSize,
    );
    expect(ai.econ.gold).toBe(2 * PIECES.P.cost);
    expect(poolTotal(game.pool)).toBe(pool + 2);
  });

  it('easy fills squares in reading order instead of formation', () => {
    const game = armyOf('P');
    placeArmy(game, 1, AI_DIFFICULTY.easy);
    expect(game.players[1].holdings.board[0]).toMatchObject({ x: BOARD.wallRightX, y: 0 });
  });
});

describe('AI plays the same game', () => {
  function playAiVsAi(difficulty: AiDifficulty, seed: number): GameState {
    const prep = createAiPrep(difficulty);
    const game = createGame({ mode: 'ai', seed }, prep);
    game.players[0].isAI = true;
    for (let guard = 0; guard < MAX_ROUNDS && game.phase !== 'over'; guard++) {
      prep(game, 0); // the "human" seat is played by the same AI
      if (game.phase === 'handoff') confirmHandoff(game);
      ready(game);
      skipCombat(game);
      // Every prep must leave a legal position.
      for (const p of game.players) {
        expect(p.econ.gold).toBeGreaterThanOrEqual(0);
        expect(p.holdings.board.length).toBeLessThanOrEqual(boardCap(p.econ.level));
      }
      nextRound(game, prep);
    }
    return game;
  }

  for (const difficulty of DIFFICULTIES) {
    it(`a ${difficulty} AI-vs-AI match finishes and conserves every piece`, () => {
      const game = playAiVsAi(difficulty, SEED);
      expect(game.phase).toBe('over');
      expect(copies(game)).toBe(TOTAL_COPIES);
    });
  }

  it('is deterministic for a seed and difficulty', () => {
    expect(JSON.stringify(playAiVsAi('normal', SEED))).toBe(
      JSON.stringify(playAiVsAi('normal', SEED)),
    );
  });
});
