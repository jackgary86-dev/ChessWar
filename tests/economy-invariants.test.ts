/**
 * Bug check (QA ticket): economy and shop invariants under random play. Two
 * players take random shop and placement actions for many seeded games, and
 * the pool, gold, bench and board rules are checked after every single action.
 * Failure messages carry the seed.
 */
import { describe, expect, it } from 'vitest';

import { PIECES, PIECE_ORDER, PLAYER, POOL_SIZE, boardCap, copiesForStars } from '@sim/data.ts';
import { addXp, createEconomy, recordFight, roundIncome, startRoundEconomy } from '@sim/economy.ts';
import type { Economy, FightOutcome } from '@sim/economy.ts';
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
} from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import { createRng, int } from '@sim/rng.ts';
import type { Rng } from '@sim/rng.ts';
import type { PieceType, Side } from '@sim/types.ts';

const GAMES = 60;
const MAX_ROUNDS = 30;
const ACTIONS_PER_PREP = 25;
const TOP_UP_GOLD = 40;
const BOARD_SQUARES = 8;

/** Copies of each type that are in the pool, a shop or a player's hands. */
function accounted(game: GameState): Record<PieceType, number> {
  const total = { ...game.pool };
  for (const player of game.players) {
    for (const card of player.shop.slots) if (card !== null) total[card] += 1;
    const { bench, board } = player.holdings;
    for (const piece of [...bench, ...board]) {
      if (piece) total[piece.type] += copiesForStars(piece.stars);
    }
  }
  return total;
}

function check(game: GameState, seed: number, what: string): void {
  const where = `seed ${String(seed)}, round ${String(game.round)}, after ${what}`;
  expect(accounted(game), `pool conserved: ${where}`).toEqual(POOL_SIZE);
  for (const side of [0, 1] as const) {
    const { econ, holdings } = game.players[side];
    expect(econ.gold, `gold >= 0: ${where}`).toBeGreaterThanOrEqual(0);
    expect(holdings.bench, `bench size: ${where}`).toHaveLength(PLAYER.benchSize);
    expect(holdings.board.length, `board <= level: ${where}`).toBeLessThanOrEqual(
      boardCap(econ.level),
    );
    const ids = [...holdings.bench, ...holdings.board].flatMap((p) => (p ? [p.id] : []));
    expect(new Set(ids).size, `unique piece ids: ${where}`).toBe(ids.length);
    for (const piece of [...holdings.bench, ...holdings.board]) {
      expect(piece?.stars ?? 1, `stars in range: ${where}`).toBeLessThanOrEqual(3);
    }
    const squares = holdings.board.map((p) => `${String(p.x)},${String(p.y)}`);
    expect(new Set(squares).size, `no shared squares: ${where}`).toBe(squares.length);
  }
}

function randomAction(game: GameState, side: Side, rng: Rng, seed: number): void {
  const { holdings, econ, shop } = game.players[side];
  const all = [...holdings.bench, ...holdings.board].flatMap((p) => (p ? [p] : []));
  const pick = int(rng, 8);
  let what: string;
  if (pick <= 2) {
    const slot = int(rng, PLAYER.shopSize);
    const card = shop.slots[slot] ?? null;
    const goldBefore = econ.gold;
    const result = buyCard(game, side, slot);
    what = `buy slot ${String(slot)} -> ${result}`;
    if (card !== null && goldBefore < PIECES[card].cost) {
      expect(result, `unaffordable buy blocked: seed ${String(seed)}`).toBe('gold');
      expect(econ.gold).toBe(goldBefore);
    }
  } else if (pick === 3) {
    const piece = all[int(rng, Math.max(1, all.length))];
    what = 'sell';
    if (piece) sellPiece(game, side, piece.id);
  } else if (pick === 4) {
    what = rerollShop(game, side) === true ? 'reroll' : 'failed reroll';
  } else if (pick === 5) {
    lockShop(game, side);
    what = 'lock';
  } else if (pick === 6) {
    const piece = all[int(rng, Math.max(1, all.length))];
    what = 'place';
    if (piece) {
      const x = (side === 0 ? 0 : BOARD_SQUARES) + int(rng, BOARD_SQUARES);
      placePiece(game, side, piece.id, x, int(rng, BOARD_SQUARES));
    }
  } else if (pick === 7 && int(rng, 2) === 0) {
    buyXpIntent(game, side);
    what = 'buy xp';
  } else {
    const piece = holdings.board[int(rng, Math.max(1, holdings.board.length))];
    what = 'bench';
    if (piece) benchPiece(game, side, piece.id);
  }
  check(game, seed, what);
}

function prep(game: GameState, rng: Rng, seed: number): void {
  const side = game.active;
  game.players[side].econ.gold = TOP_UP_GOLD - int(rng, TOP_UP_GOLD);
  for (let i = 0; i < ACTIONS_PER_PREP; i++) randomAction(game, side, rng, seed);
}

function playGame(seed: number): number {
  const game = createGame({ mode: 'local', seed });
  const rng = createRng(seed + 1);
  let rounds = 0;
  while (game.phase !== 'over' && rounds < MAX_ROUNDS) {
    confirmHandoff(game);
    prep(game, rng, seed);
    ready(game);
    confirmHandoff(game);
    prep(game, rng, seed);
    ready(game);
    skipCombat(game);
    check(game, seed, 'the fight');
    nextRound(game);
    check(game, seed, 'the next round starts');
    rounds += 1;
  }
  return rounds;
}

describe('shop and economy invariants under random play', () => {
  it(`hold for ${String(GAMES)} random games`, () => {
    let rounds = 0;
    for (let seed = 1; seed <= GAMES; seed++) rounds += playGame(seed);
    expect(rounds).toBeGreaterThan(GAMES);
  }, 60_000);

  it('never loses or duplicates a piece when copies chain-merge', () => {
    const game = createGame({ mode: 'local', seed: 1 });
    confirmHandoff(game);
    const { holdings, shop, econ } = game.players[0];
    econ.gold = 1000;
    const owned = (): string[] =>
      [...holdings.bench, ...holdings.board].flatMap((p) =>
        p ? [`${p.type}${String(p.stars)}`] : [],
      );
    for (let bought = 1; bought <= 9; bought++) {
      // Put a pawn in slot 0, taking it from the pool and returning what was there.
      const old = shop.slots[0] ?? null;
      if (old !== null) game.pool[old] += 1;
      shop.slots[0] = 'P';
      game.pool.P -= 1;
      expect(buyCard(game, 0, 0)).toBe('ok');
      expect(accounted(game)).toEqual(POOL_SIZE);
      // Nine copies fold into 3 pieces at 2 stars, then into one 3-star.
      const expected = ['P1', 'P1P1', 'P2', 'P2P1', 'P2P1P1', 'P2P2', 'P2P2P1', 'P2P2P1P1', 'P3'];
      expect(owned().sort().join('')).toBe(expected[bought - 1]?.match(/P\d/g)?.sort().join(''));
    }
  });
});

// ---------------------------------------------------------------------------
// Income, interest and streak math for 30 rounds, against the spec's literals
// ---------------------------------------------------------------------------

/** Spec §3.4, written out independently of `economy.ts`. */
function specIncome(round: number, gold: number, streak: number, lastWon: boolean): number {
  if (round === 1) return 3;
  const base = Math.min(5, round + 2);
  const interest = Math.min(5, Math.floor(gold / 10));
  const length = Math.abs(streak);
  const streakGold = length >= 6 ? 3 : length >= 4 ? 2 : length >= 2 ? 1 : 0;
  return base + interest + streakGold + (lastWon ? 1 : 0);
}

describe('income for 30 rounds', () => {
  it('matches the spec formula through wins, losses and draws', () => {
    const rng = createRng(2024);
    const outcomes: FightOutcome[] = ['win', 'loss', 'draw'];
    const econ: Economy = createEconomy();
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const expected = specIncome(round, econ.gold, econ.streak, econ.lastWon);
      expect(roundIncome(round, econ).total, `round ${String(round)}`).toBe(expected);
      const goldBefore = econ.gold;
      startRoundEconomy(econ, round);
      expect(econ.gold - goldBefore).toBe(expected);
      // Spend some gold so interest bands vary.
      econ.gold -= int(rng, econ.gold + 1);
      recordFight(econ, outcomes[int(rng, outcomes.length)] ?? 'draw');
    }
  });

  it('gives the 2/4/6 streak thresholds and resets on a draw', () => {
    const econ = createEconomy();
    const bonusAt = (): number => roundIncome(5, { ...econ, gold: 0, lastWon: false }).streak;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      recordFight(econ, 'win');
      seen.push(bonusAt());
    }
    expect(seen).toEqual([0, 1, 1, 2, 2, 3]);
    recordFight(econ, 'draw');
    expect(bonusAt()).toBe(0);
  });

  it('gains XP for 30 rounds without exceeding the level cap', () => {
    const econ = createEconomy();
    for (let round = 1; round <= MAX_ROUNDS; round++) startRoundEconomy(econ, round);
    expect(econ.level).toBeLessThanOrEqual(PLAYER.maxLevel);
    addXp(econ, 1000);
    expect(econ.level).toBe(PLAYER.maxLevel);
    expect(econ.xp).toBe(0);
    expect(PIECE_ORDER.length).toBe(5);
  });
});
