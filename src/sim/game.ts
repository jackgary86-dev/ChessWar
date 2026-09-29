/**
 * Round flow state machine (spec §3.5) and fight damage (§3.4).
 *
 *   prep → (handoff) → combat → result → next round | game over
 *
 * vs AI: the AI preps when the round starts (through the `aiPrep` hook, so
 * this module does not depend on `ai.ts`), then the human preps and clicks
 * ready. Local 2-player: a handoff screen precedes each player's prep,
 * Player 1's included.
 *
 * Everything is plain data plus functions, so a whole match is serializable
 * and can run headless or on a server. The `intent` functions (buyCard,
 * sellPiece, ...) are what a UI or a network client calls during prep; each
 * refuses to act outside its player's prep phase.
 */
import { createBattle, stepBattle } from './battle.ts';
import type { ArmyPiece, BattleState } from './battle.ts';
import { BOARD, FIGHT_DAMAGE, PLAYER } from './data.ts';
import {
  buyXp,
  canPlaceOnBoard,
  createEconomy,
  recordFight,
  startRoundEconomy,
} from './economy.ts';
import type { Economy, IncomeBreakdown } from './economy.ts';
import { createRng } from './rng.ts';
import type { Rng } from './rng.ts';
import {
  buy,
  createHoldings,
  createPool,
  createShop,
  reroll,
  sell,
  startRoundShop,
  toggleLock,
} from './shop.ts';
import type { BuyResult, Holdings, Pool, ShopState } from './shop.ts';
import type { Side } from './types.ts';

export type GameMode = 'ai' | 'local';
export type Phase = 'handoff' | 'prep' | 'combat' | 'result' | 'over';

export interface PlayerState {
  name: string;
  hp: number;
  econ: Economy;
  holdings: Holdings;
  shop: ShopState;
  isAI: boolean;
}

/** What happened in a fight, for the result overlay and the log. */
export interface RoundResult {
  round: number;
  /** Winning side; null for a draw. */
  winner: Side | null;
  /** True when the fight was decided on remaining material rather than a wipe-out. */
  byMaterial: boolean;
  /** HP lost by each side. */
  damage: [number, number];
  /** Breakdown of the loser's damage. Zero for a draw. */
  survivingStars: number;
  roundBonus: number;
}

export interface GameState {
  mode: GameMode;
  round: number;
  phase: Phase;
  /** Side whose prep or handoff screen is showing. */
  active: Side;
  players: [PlayerState, PlayerState];
  pool: Pool;
  rng: Rng;
  battle: BattleState | null;
  result: RoundResult | null;
  /** Set when phase is 'over': the surviving side, or null for mutual destruction. */
  gameWinner: Side | null;
  /** Income granted at the start of the current round. */
  income: [IncomeBreakdown, IncomeBreakdown] | null;
}

/** Lets the AI shop and place for `side` at the start of a round. */
export type AiPrep = (game: GameState, side: Side) => void;

export interface GameOptions {
  mode: GameMode;
  seed: number;
  names?: [string, string];
}

const SIDES: readonly Side[] = [0, 1];

function createPlayer(name: string, isAI: boolean): PlayerState {
  return {
    name,
    hp: PLAYER.startHp,
    econ: createEconomy(),
    holdings: createHoldings(),
    shop: createShop(),
    isAI,
  };
}

function otherSide(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/** Create a match and start round 1. */
export function createGame(options: GameOptions, aiPrep?: AiPrep): GameState {
  const [nameA, nameB] =
    options.names ?? (options.mode === 'ai' ? ['You', 'Iron Bot'] : ['Player 1', 'Player 2']);
  const game: GameState = {
    mode: options.mode,
    round: 0,
    phase: 'prep',
    active: 0,
    players: [createPlayer(nameA, false), createPlayer(nameB, options.mode === 'ai')],
    pool: createPool(),
    rng: createRng(options.seed),
    battle: null,
    result: null,
    gameWinner: null,
    income: null,
  };
  startRound(game, aiPrep);
  return game;
}

/** Begin the next round: income, XP, free shop rolls, then prep (or handoff). */
export function startRound(game: GameState, aiPrep?: AiPrep): void {
  game.round += 1;
  game.battle = null;
  game.result = null;
  const [a, b] = game.players;
  game.income = [startRoundEconomy(a.econ, game.round), startRoundEconomy(b.econ, game.round)];
  for (const player of game.players) {
    startRoundShop(game.pool, player.shop, player.econ.level, game.rng);
  }
  game.active = 0;
  game.phase = game.mode === 'local' ? 'handoff' : 'prep';
  if (aiPrep) {
    for (const side of SIDES) {
      if (game.players[side].isAI) aiPrep(game, side);
    }
  }
}

// ---------------------------------------------------------------------------
// Prep intents (what a UI or a network client may do)
// ---------------------------------------------------------------------------

export type IntentError = 'wrong-phase' | 'not-your-turn' | 'invalid';

/** Prep-phase actions only work for the side whose prep it is. */
function prepError(game: GameState, side: Side): IntentError | null {
  if (game.phase !== 'prep') return 'wrong-phase';
  return game.active === side ? null : 'not-your-turn';
}

export function buyCard(game: GameState, side: Side, slot: number): BuyResult | IntentError {
  const error = prepError(game, side);
  if (error) return error;
  const player = game.players[side];
  return buy(player.shop, player.holdings, player.econ, slot);
}

/** Sell a piece from the bench or board. Returns the gold refunded. */
export function sellPiece(game: GameState, side: Side, pieceId: number): number | IntentError {
  const error = prepError(game, side);
  if (error) return error;
  const player = game.players[side];
  return sell(game.pool, player.holdings, player.econ, pieceId) ?? 'invalid';
}

export function rerollShop(game: GameState, side: Side): boolean | IntentError {
  const error = prepError(game, side);
  if (error) return error;
  const player = game.players[side];
  return reroll(game.pool, player.shop, player.econ, player.econ.level, game.rng);
}

export function lockShop(game: GameState, side: Side): IntentError | null {
  const error = prepError(game, side);
  if (error) return error;
  toggleLock(game.players[side].shop);
  return null;
}

export function buyXpIntent(game: GameState, side: Side): boolean | IntentError {
  const error = prepError(game, side);
  if (error) return error;
  return buyXp(game.players[side].econ);
}

/** Is a world square on this side's own 8×8 board? */
function onOwnBoard(side: Side, x: number, y: number): boolean {
  const left = side === 0 ? 0 : BOARD.wallRightX;
  return x >= left && x < left + BOARD.width / 2 && y >= 0 && y < BOARD.height;
}

/**
 * Place a piece from the bench or the board onto a square of the player's own
 * board. An occupied square swaps the two pieces. Bench → board is limited by
 * the level's board cap.
 */
export function placePiece(
  game: GameState,
  side: Side,
  pieceId: number,
  x: number,
  y: number,
): 'ok' | 'board-full' | IntentError {
  const error = prepError(game, side);
  if (error) return error;
  if (!onOwnBoard(side, x, y)) return 'invalid';
  const { holdings, econ } = game.players[side];

  const benchIndex = holdings.bench.findIndex((p) => p?.id === pieceId);
  const fromBoard = holdings.board.find((p) => p.id === pieceId);
  const occupant = holdings.board.find((p) => p.x === x && p.y === y);
  if (fromBoard) {
    if (occupant && occupant !== fromBoard) {
      [occupant.x, occupant.y, fromBoard.x, fromBoard.y] = [fromBoard.x, fromBoard.y, x, y];
    } else {
      fromBoard.x = x;
      fromBoard.y = y;
    }
    return 'ok';
  }
  const piece = holdings.bench[benchIndex];
  if (!piece) return 'invalid';
  if (occupant) {
    // Swap: the board piece takes the bench slot.
    holdings.bench[benchIndex] = { id: occupant.id, type: occupant.type, stars: occupant.stars };
    holdings.board = holdings.board.map((p) => (p === occupant ? { ...piece, x, y } : p));
    return 'ok';
  }
  if (!canPlaceOnBoard(econ, holdings.board.length)) return 'board-full';
  holdings.bench[benchIndex] = null;
  holdings.board.push({ ...piece, x, y });
  return 'ok';
}

/** Move a board piece back to the first free bench slot. */
export function benchPiece(game: GameState, side: Side, pieceId: number): 'ok' | IntentError {
  const error = prepError(game, side);
  if (error) return error;
  const { holdings } = game.players[side];
  const piece = holdings.board.find((p) => p.id === pieceId);
  const free = holdings.bench.indexOf(null);
  if (!piece || free < 0) return 'invalid';
  holdings.board = holdings.board.filter((p) => p !== piece);
  holdings.bench[free] = { id: piece.id, type: piece.type, stars: piece.stars };
  return 'ok';
}

/**
 * Move a bench or board piece to a specific bench slot. An occupied slot swaps:
 * a bench occupant trades places, a board piece's square passes to the occupant
 * (so the board count is unchanged).
 */
export function moveToBenchSlot(
  game: GameState,
  side: Side,
  pieceId: number,
  slot: number,
): 'ok' | IntentError {
  const error = prepError(game, side);
  if (error) return error;
  const { holdings } = game.players[side];
  if (!Number.isInteger(slot) || slot < 0 || slot >= holdings.bench.length) return 'invalid';
  const occupant = holdings.bench[slot] ?? null;

  const fromIndex = holdings.bench.findIndex((p) => p?.id === pieceId);
  if (fromIndex >= 0) {
    [holdings.bench[fromIndex], holdings.bench[slot]] = [
      occupant,
      holdings.bench[fromIndex] ?? null,
    ];
    return 'ok';
  }
  const piece = holdings.board.find((p) => p.id === pieceId);
  if (!piece) return 'invalid';
  holdings.bench[slot] = { id: piece.id, type: piece.type, stars: piece.stars };
  holdings.board = occupant
    ? holdings.board.map((p) => (p === piece ? { ...occupant, x: piece.x, y: piece.y } : p))
    : holdings.board.filter((p) => p !== piece);
  return 'ok';
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

/** The looking-away screen is dismissed: the named player's prep begins. */
export function confirmHandoff(game: GameState): boolean {
  if (game.phase !== 'handoff') return false;
  game.phase = 'prep';
  return true;
}

/**
 * The active player is done. Local play hands over to the other player after
 * Player 1; otherwise the fight begins.
 */
export function ready(game: GameState): boolean {
  if (game.phase !== 'prep') return false;
  if (game.mode === 'local' && game.active === 0) {
    game.active = 1;
    game.phase = 'handoff';
    return true;
  }
  beginCombat(game);
  return true;
}

function armyOf(game: GameState): ArmyPiece[] {
  return SIDES.flatMap((side) =>
    game.players[side].holdings.board.map((p) => ({
      type: p.type,
      stars: p.stars,
      pos: { x: p.x, y: p.y },
    })),
  );
}

function beginCombat(game: GameState): void {
  game.battle = createBattle(armyOf(game), game.rng);
  game.phase = 'combat';
  if (game.battle.finished) finishFight(game);
}

/** Advance the fight one tick (the UI paces these). */
export function stepCombat(game: GameState): boolean {
  if (game.phase !== 'combat' || !game.battle) return false;
  stepBattle(game.battle);
  if (game.battle.finished) finishFight(game);
  return true;
}

/** "Skip to result": run the rest of the fight at once. */
export function skipCombat(game: GameState): boolean {
  if (game.phase !== 'combat' || !game.battle) return false;
  while (!game.battle.finished) stepBattle(game.battle);
  finishFight(game);
  return true;
}

function finishFight(game: GameState): void {
  const battle = game.battle;
  if (!battle) return;
  const winner = battle.winner;
  const damage: [number, number] = [0, 0];
  let survivingStars = 0;
  let roundBonus = 0;
  if (winner === null) {
    damage[0] = FIGHT_DAMAGE.drawDamage;
    damage[1] = FIGHT_DAMAGE.drawDamage;
  } else {
    survivingStars = battle.units
      .filter((u) => u.side === winner && u.hp > 0)
      .reduce((sum, u) => sum + u.stars, 0);
    roundBonus = Math.floor(game.round / FIGHT_DAMAGE.lossRoundDivisor);
    damage[otherSide(winner)] = FIGHT_DAMAGE.lossBase + survivingStars + roundBonus;
  }
  for (const side of SIDES) {
    const player = game.players[side];
    player.hp = Math.max(0, player.hp - damage[side]);
    recordFight(player.econ, winner === null ? 'draw' : winner === side ? 'win' : 'loss');
  }
  game.result = {
    round: game.round,
    winner,
    byMaterial: battle.endReason !== 'elimination',
    damage,
    survivingStars,
    roundBonus,
  };
  game.phase = 'result';
}

/** Leave the result screen: next round, or game over if a commander has fallen. */
export function nextRound(game: GameState, aiPrep?: AiPrep): boolean {
  if (game.phase !== 'result') return false;
  const fallen = game.players.filter((p) => p.hp <= 0);
  if (fallen.length > 0) {
    game.phase = 'over';
    const survivor = SIDES.find((side) => game.players[side].hp > 0);
    game.gameWinner = survivor ?? null;
    return true;
  }
  startRound(game, aiPrep);
  return true;
}
