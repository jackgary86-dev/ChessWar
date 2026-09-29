/**
 * AI opponent (spec §3.6): shops, levels up and places pieces by the same
 * rules as a human, from public information only.
 *
 * Priorities each prep:
 *   1. buy shop pieces that match ones it already owns;
 *   2. level up toward the round's target level;
 *   3. fill its army up to level + a margin with the most expensive piece it
 *      can afford, keeping gold in reserve for interest from mid-game;
 *   4. reroll a limited number of times when rich.
 * Then it places its best pieces in formation.
 *
 * Difficulty only changes how well it plays (see `AI_DIFFICULTY`).
 */
import {
  AI,
  AI_DIFFICULTY,
  AI_FORMATION,
  BOARD,
  PIECES,
  PLAYER,
  boardCap,
  copiesForStars,
  sellValue,
} from './data.ts';
import type { AiDifficulty, AiDifficultyDef } from './data.ts';
import { buyXp } from './economy.ts';
import type { AiPrep, GameState, PlayerState } from './game.ts';
import { buy, canTake, countOwned, mergeAll, reroll, returnToPool } from './shop.ts';
import type { OwnedPiece } from './shop.ts';
import type { Level, PieceType, Side } from './types.ts';

/** Safety cap on shopping actions in one prep. */
const MAX_PREP_ACTIONS = 50;

/** Level the AI aims for in a round. */
export function targetLevel(round: number, difficulty: AiDifficultyDef): Level {
  const base = AI.levelBase + Math.floor((round + AI.levelRoundOffset) / AI.levelRoundDivisor);
  return Math.max(PLAYER.minLevel, Math.min(PLAYER.maxLevel, base - difficulty.levelLag)) as Level;
}

function owned(player: PlayerState): OwnedPiece[] {
  return [
    ...player.holdings.board,
    ...player.holdings.bench.filter((p): p is OwnedPiece => p !== null),
  ];
}

function valueOf(piece: OwnedPiece): number {
  return PIECES[piece.type].cost * copiesForStars(piece.stars);
}

/** One shopping action. Returns false when there is nothing more worth doing. */
function shopOnce(
  game: GameState,
  player: PlayerState,
  rerolls: { used: number },
  d: AiDifficultyDef,
): boolean {
  const { holdings, econ, shop } = player;

  // 1. Cards that match a piece we already own.
  for (let slot = 0; slot < shop.slots.length; slot++) {
    const type = shop.slots[slot];
    if (!type || econ.gold < PIECES[type].cost || !canTake(holdings, type)) continue;
    if (
      countOwned(holdings, type, 1) + countOwned(holdings, type, 2) >= 1 &&
      buy(shop, holdings, econ, slot) === 'ok'
    ) {
      return true;
    }
  }

  // 2. Level up toward the target.
  if (econ.level < targetLevel(game.round, d) && buyXp(econ)) return true;

  // 3. Fill the army with the most expensive affordable card.
  const count = owned(player).length;
  if (count < econ.level + d.armyOverLevel) {
    const reserve =
      game.round >= AI.interestReserveFromRound && count >= econ.level ? AI.interestReserve : 0;
    let best = -1;
    let bestCost = -1;
    shop.slots.forEach((type, slot) => {
      if (!type) return;
      const cost = PIECES[type].cost;
      if (econ.gold - cost >= reserve && canTake(holdings, type) && cost > bestCost) {
        best = slot;
        bestCost = cost;
      }
    });
    if (best >= 0 && buy(shop, holdings, econ, best) === 'ok') return true;
  }

  // 4. Rich enough to look for something better.
  if (
    d.maxRerolls > 0 &&
    econ.gold >= d.rerollMinGold &&
    game.round >= d.rerollFromRound &&
    rerolls.used < d.maxRerolls &&
    reroll(game.pool, shop, econ, econ.level, game.rng)
  ) {
    rerolls.used += 1;
    return true;
  }
  return false;
}

/** World square for a formation slot: depth 0 is next to the wall. */
function formationSquare(side: Side, depth: number, y: number): { x: number; y: number } {
  return { x: side === 0 ? BOARD.wallLeftX - depth : BOARD.wallRightX + depth, y };
}

/** Place the best pieces on the board in formation and bench (or sell) the rest. */
export function placeArmy(game: GameState, side: Side, d: AiDifficultyDef): void {
  const player = game.players[side];
  const { holdings, econ } = player;
  const pieces = owned(player).sort(
    (a, b) => valueOf(b) - valueOf(a) || PIECES[b.type].hp - PIECES[a.type].hp || a.id - b.id,
  );
  holdings.board = [];
  holdings.bench = holdings.bench.map(() => null);

  const taken = new Set<string>();
  const key = (x: number, y: number): string => `${String(x)},${String(y)}`;
  const claim = (type: PieceType): { x: number; y: number } | null => {
    const spots = d.useFormation ? AI_FORMATION[type] : [];
    for (const [depth, y] of spots) {
      const sq = formationSquare(side, depth, y);
      if (!taken.has(key(sq.x, sq.y))) return sq;
    }
    for (let depth = 0; depth < BOARD.width / 2; depth++) {
      for (let y = 0; y < BOARD.height; y++) {
        const sq = formationSquare(side, depth, y);
        if (!taken.has(key(sq.x, sq.y))) return sq;
      }
    }
    return null;
  };

  const cap = boardCap(econ.level);
  pieces.forEach((piece, index) => {
    if (index < cap) {
      const sq = claim(piece.type);
      if (sq) {
        taken.add(key(sq.x, sq.y));
        holdings.board.push({ id: piece.id, type: piece.type, stars: piece.stars, ...sq });
      }
      return;
    }
    const benchIndex = index - cap;
    if (benchIndex < PLAYER.benchSize) {
      holdings.bench[benchIndex] = { id: piece.id, type: piece.type, stars: piece.stars };
    } else {
      // Bench overflow: sell the extras.
      econ.gold += sellValue(piece.type, piece.stars);
      returnToPool(game.pool, piece.type, copiesForStars(piece.stars));
    }
  });
}

/** Let the AI shop and place for `side`. */
export function prepAi(game: GameState, side: Side, difficulty: AiDifficulty = 'normal'): void {
  const d = AI_DIFFICULTY[difficulty];
  const player = game.players[side];
  const rerolls = { used: 0 };
  for (let action = 0; action < MAX_PREP_ACTIONS; action++) {
    if (!shopOnce(game, player, rerolls, d)) break;
  }
  mergeAll(player.holdings);
  placeArmy(game, side, d);
}

/** An `AiPrep` hook for `createGame` / `nextRound` at a given difficulty. */
export function createAiPrep(difficulty: AiDifficulty = 'normal'): AiPrep {
  return (game, side) => {
    prepAi(game, side, difficulty);
  };
}
