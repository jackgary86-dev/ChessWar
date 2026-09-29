import { describe, expect, it } from 'vitest';

import { BOARD, FIGHT_DAMAGE, PLAYER, PIECE_ORDER, POOL_SIZE, copiesForStars } from '@sim/data.ts';
import {
  benchPiece,
  buyCard,
  buyXpIntent,
  confirmHandoff,
  createGame,
  lockShop,
  nextRound,
  placePiece,
  ready,
  rerollShop,
  sellPiece,
  skipCombat,
  startRound,
  stepCombat,
} from '@sim/game.ts';
import type { GameMode, GameState } from '@sim/game.ts';
import { poolTotal } from '@sim/shop.ts';
import type { PieceType, Side, StarLevel } from '@sim/types.ts';

const SEED = 21;
const MAX_ROUNDS = 100;
const TOTAL_COPIES = PIECE_ORDER.reduce((sum, type) => sum + POOL_SIZE[type], 0);

function newGame(mode: GameMode = 'ai'): GameState {
  return createGame({ mode, seed: SEED });
}

/** Put a piece straight on a side's board (test setup only). */
function addToBoard(
  game: GameState,
  side: Side,
  type: PieceType,
  stars: StarLevel,
  x: number,
  y: number,
): void {
  const { holdings } = game.players[side];
  holdings.board.push({ id: holdings.nextId, type, stars, x, y });
  holdings.nextId += 1;
}

/** A simple scripted player: buy what it can, place what fits, ready up. */
function play(game: GameState, side: Side): void {
  const player = game.players[side];
  for (let slot = 0; slot < PLAYER.shopSize; slot++) buyCard(game, side, slot);
  const left = side === 0 ? 0 : BOARD.wallRightX;
  const pieces = player.holdings.bench.filter((p) => p !== null);
  let index = 0;
  for (const piece of pieces) {
    const x = left + (index % (BOARD.width / 2));
    const y = Math.floor(index / (BOARD.width / 2)) + 1;
    placePiece(game, side, piece.id, x, y);
    index += 1;
  }
}

function countCopies(game: GameState): number {
  const held = game.players.reduce(
    (sum, p) =>
      sum +
      [...p.holdings.board, ...p.holdings.bench.filter((b) => b !== null)].reduce(
        (n, piece) => n + copiesForStars(piece.stars),
        0,
      ) +
      p.shop.slots.filter((c) => c !== null).length,
    0,
  );
  return held + poolTotal(game.pool);
}

/** Drive a whole match headlessly through the state machine. */
function playMatch(mode: GameMode, seed: number): GameState {
  const game = createGame({ mode, seed });
  for (let guard = 0; guard < MAX_ROUNDS && game.phase !== 'over'; guard++) {
    for (const side of [0, 1] as const) {
      if (game.phase === 'handoff') confirmHandoff(game);
      play(game, side);
      ready(game);
    }
    if (game.phase === 'combat') skipCombat(game);
    nextRound(game);
  }
  return game;
}

describe('round flow', () => {
  it('starts round 1 in prep with 3 gold, full shops and a full pool count', () => {
    const game = newGame('ai');
    expect(game).toMatchObject({ round: 1, phase: 'prep', active: 0 });
    for (const p of game.players) {
      expect(p.hp).toBe(PLAYER.startHp);
      expect(p.econ.gold).toBe(3);
      expect(p.shop.slots.every((c) => c !== null)).toBe(true);
    }
    expect(countCopies(game)).toBe(TOTAL_COPIES);
  });

  it('vs AI goes prep → combat → result → next round', () => {
    const game = newGame('ai');
    expect(ready(game)).toBe(true);
    // Both boards are empty, so the fight ends at once as a draw.
    expect(game.phase).toBe('result');
    expect(nextRound(game)).toBe(true);
    expect(game).toMatchObject({ round: 2, phase: 'prep' });
  });

  it('local play shows a handoff before each prep, Player 1 included', () => {
    const game = newGame('local');
    expect(game).toMatchObject({ phase: 'handoff', active: 0 });
    expect(confirmHandoff(game)).toBe(true);
    expect(game.phase).toBe('prep');
    expect(ready(game)).toBe(true);
    expect(game).toMatchObject({ phase: 'handoff', active: 1 });
    confirmHandoff(game);
    expect(game).toMatchObject({ phase: 'prep', active: 1 });
    ready(game);
    expect(game.phase).toBe('result');
    nextRound(game);
    expect(game).toMatchObject({ round: 2, phase: 'handoff', active: 0 });
  });

  it('ignores transitions from the wrong phase', () => {
    const game = newGame('ai');
    expect(confirmHandoff(game)).toBe(false);
    expect(nextRound(game)).toBe(false);
    expect(skipCombat(game)).toBe(false);
    expect(stepCombat(game)).toBe(false);
  });

  it('calls the AI hook for AI players at the start of every round', () => {
    const calls: [number, Side][] = [];
    const game = createGame({ mode: 'ai', seed: SEED }, (g, side) => calls.push([g.round, side]));
    ready(game);
    nextRound(game, (g, side) => calls.push([g.round, side]));
    expect(calls).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  it('a locked shop survives into the next round, once', () => {
    const game = newGame('ai');
    const before = [...game.players[0].shop.slots];
    lockShop(game, 0);
    ready(game);
    nextRound(game);
    expect(game.players[0].shop.slots).toEqual(before);
    expect(game.players[0].shop.locked).toBe(false);
  });
});

describe('fight damage', () => {
  it('loser takes 2 + surviving winner stars + floor(round/4)', () => {
    const game = newGame('ai');
    game.round = 8;
    addToBoard(game, 0, 'Q', 3, 3, 3);
    addToBoard(game, 0, 'P', 2, 2, 2);
    ready(game);
    expect(game.result).toMatchObject({
      winner: 0,
      byMaterial: false,
      survivingStars: 5,
      roundBonus: 2,
      damage: [0, 2 + 5 + 2],
    });
    expect(game.players[1].hp).toBe(PLAYER.startHp - 9);
    expect(game.players[0].hp).toBe(PLAYER.startHp);
  });

  it('a draw costs both players 2 HP and resets streaks', () => {
    const game = newGame('ai');
    game.players[0].econ.streak = 3;
    ready(game);
    expect(game.result).toMatchObject({ winner: null, damage: [2, 2] });
    for (const p of game.players) {
      expect(p.hp).toBe(PLAYER.startHp - FIGHT_DAMAGE.drawDamage);
      expect(p.econ).toMatchObject({ streak: 0, lastWon: false });
    }
  });

  it('records streaks and the win bonus for the next round income', () => {
    const game = newGame('ai');
    addToBoard(game, 1, 'R', 1, 12, 3);
    ready(game);
    expect(game.players[1].econ).toMatchObject({ streak: 1, lastWon: true });
    expect(game.players[0].econ).toMatchObject({ streak: -1, lastWon: false });
    nextRound(game);
    expect(game.income?.[1].win).toBe(1);
    expect(game.income?.[0].win).toBe(0);
  });

  it('ends the game when a commander reaches 0 HP', () => {
    const game = newGame('ai');
    game.players[1].hp = 3;
    addToBoard(game, 0, 'Q', 2, 3, 3);
    ready(game);
    expect(game.players[1].hp).toBe(0);
    expect(nextRound(game)).toBe(true);
    expect(game).toMatchObject({ phase: 'over', gameWinner: 0 });
    expect(nextRound(game)).toBe(false);
  });

  it('mutual destruction has no winner', () => {
    const game = newGame('ai');
    game.players[0].hp = FIGHT_DAMAGE.drawDamage;
    game.players[1].hp = FIGHT_DAMAGE.drawDamage;
    ready(game);
    nextRound(game);
    expect(game).toMatchObject({ phase: 'over', gameWinner: null });
  });

  it('a fight can be stepped tick by tick to the result', () => {
    const game = newGame('ai');
    addToBoard(game, 0, 'R', 1, 6, 2);
    addToBoard(game, 1, 'R', 1, 9, 2);
    ready(game);
    expect(game.phase).toBe('combat');
    let ticks = 0;
    while (game.phase === 'combat') {
      stepCombat(game);
      ticks += 1;
    }
    expect(ticks).toBeGreaterThan(0);
    expect(game.phase).toBe('result');
  });
});

describe('prep intents', () => {
  it('refuse to act outside prep or for the wrong side', () => {
    const local = newGame('local');
    expect(buyCard(local, 0, 0)).toBe('wrong-phase');
    confirmHandoff(local);
    expect(buyCard(local, 1, 0)).toBe('not-your-turn');
    expect(rerollShop(local, 1)).toBe('not-your-turn');
    expect(lockShop(local, 1)).toBe('not-your-turn');
    expect(buyXpIntent(local, 1)).toBe('not-your-turn');
    expect(sellPiece(local, 1, 1)).toBe('not-your-turn');
    expect(placePiece(local, 1, 1, 9, 1)).toBe('not-your-turn');
  });

  it('buy, sell, reroll and buy XP change the active player', () => {
    const game = newGame('ai');
    const player = game.players[0];
    player.econ.gold = 20;
    const card = player.shop.slots.findIndex((c) => c !== null);
    expect(buyCard(game, 0, card)).toBe('ok');
    const piece = player.holdings.bench.find((p) => p !== null);
    expect(piece).toBeDefined();
    expect(typeof sellPiece(game, 0, piece?.id ?? -1)).toBe('number');
    expect(rerollShop(game, 0)).toBe(true);
    expect(buyXpIntent(game, 0)).toBe(true);
    expect(sellPiece(game, 0, 99_999)).toBe('invalid');
    expect(countCopies(game)).toBe(TOTAL_COPIES);
  });

  it('places from the bench onto the own half only, and enforces the board cap', () => {
    const game = newGame('ai');
    const player = game.players[0];
    player.econ.gold = 100;
    for (let slot = 0; slot < PLAYER.shopSize; slot++) buyCard(game, 0, slot);
    const ids = player.holdings.bench.filter((p) => p !== null).map((p) => p.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(placePiece(game, 0, ids[0] ?? 0, 9, 3)).toBe('invalid'); // opponent's half
    expect(placePiece(game, 0, ids[0] ?? 0, 3, 8)).toBe('invalid'); // off the board
    expect(placePiece(game, 0, ids[0] ?? 0, 3, 3)).toBe('ok');
    expect(placePiece(game, 0, ids[1] ?? 0, 4, 3)).toBe('ok');
    // Level 2 allows 2 pieces on the board.
    expect(placePiece(game, 0, ids[2] ?? 0, 5, 3)).toBe('board-full');
    expect(player.holdings.board).toHaveLength(2);
  });

  it('moves and swaps board pieces, and swaps with the bench when the board is full', () => {
    const game = newGame('ai');
    const player = game.players[0];
    player.econ.gold = 100;
    for (let slot = 0; slot < PLAYER.shopSize; slot++) buyCard(game, 0, slot);
    const [a, b, c] = player.holdings.bench.filter((p) => p !== null);
    if (!a || !b || !c) throw new Error('expected three pieces');
    placePiece(game, 0, a.id, 1, 1);
    placePiece(game, 0, b.id, 2, 2);
    placePiece(game, 0, a.id, 2, 2); // swap on the board
    expect(player.holdings.board.find((p) => p.id === a.id)).toMatchObject({ x: 2, y: 2 });
    expect(player.holdings.board.find((p) => p.id === b.id)).toMatchObject({ x: 1, y: 1 });
    // Board is full (level 2): dropping a benched piece on an occupied square swaps.
    expect(placePiece(game, 0, c.id, 1, 1)).toBe('ok');
    expect(player.holdings.board.find((p) => p.id === c.id)).toMatchObject({ x: 1, y: 1 });
    expect(player.holdings.bench.some((p) => p?.id === b.id)).toBe(true);
    expect(benchPiece(game, 0, c.id)).toBe('ok');
    expect(player.holdings.board).toHaveLength(1);
    expect(benchPiece(game, 0, 99_999)).toBe('invalid');
  });
});

describe('headless full match', () => {
  for (const mode of ['ai', 'local'] as const) {
    it(`plays a whole ${mode} match to game over`, () => {
      const game = playMatch(mode, SEED);
      expect(game.phase).toBe('over');
      expect(game.round).toBeLessThan(MAX_ROUNDS);
      expect(game.players.some((p) => p.hp === 0)).toBe(true);
      expect(countCopies(game)).toBe(TOTAL_COPIES);
    });
  }

  it('is deterministic for a seed', () => {
    const a = playMatch('ai', SEED);
    const b = playMatch('ai', SEED);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('startRound can be called directly and grants income and XP', () => {
    const game = newGame('ai');
    game.phase = 'result';
    startRound(game);
    expect(game.round).toBe(2);
    expect(game.players[0].econ.xp).toBe(1);
  });
});
