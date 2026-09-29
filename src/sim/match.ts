/**
 * Headless AI-vs-AI matches, for the balance runner and smoke tests.
 *
 * Both seats are played by the same AI, so any lopsided result comes from the
 * board geometry, the shared pool or turn order, not from skill. To cancel
 * turn-order effects, `playMirroredPair` plays each seed twice with the seat
 * that preps (and so draws from the shared pool) first swapped.
 */
import { prepAi } from './ai.ts';
import type { AiDifficulty } from './data.ts';
import { PIECE_ORDER } from './data.ts';
import { createGame, nextRound, ready, skipCombat } from './game.ts';
import type { GameState } from './game.ts';
import type { PieceType, Side, StarLevel } from './types.ts';

/** Safety cap; fights always cost HP, so real matches end far sooner. */
const MAX_ROUNDS = 200;

export interface MatchOptions {
  seed: number;
  difficulty?: AiDifficulty;
  /** The side that preps first each round (and draws from the pool first). */
  first?: Side;
}

export interface MatchReport {
  /** Winning side, or null for mutual destruction. */
  winner: Side | null;
  rounds: number;
  /** The winner's board in the deciding fight. Empty when there is no winner. */
  winningArmy: { type: PieceType; stars: StarLevel }[];
}

export function playAiMatch(options: MatchOptions): MatchReport {
  const difficulty = options.difficulty ?? 'normal';
  const first = options.first ?? 0;
  const order: Side[] = first === 0 ? [0, 1] : [1, 0];
  // The hook fires per AI seat; prep both seats once, in the chosen order.
  const prepBoth = (game: GameState, side: Side): void => {
    if (side !== 0) return;
    for (const s of order) prepAi(game, s, difficulty);
  };
  const game = createGame({ mode: 'ai', seed: options.seed }, prepBoth);
  game.players[0].isAI = true;
  // createGame ran the hook before seat 0 was marked as AI; nothing to redo
  // because prepBoth prepped both seats already.
  let lastBoards: GameState['players'][number]['holdings']['board'][] = [[], []];
  while (game.phase !== 'over' && game.round <= MAX_ROUNDS) {
    ready(game);
    lastBoards = game.players.map((p) => p.holdings.board.map((b) => ({ ...b })));
    skipCombat(game);
    nextRound(game, prepBoth);
  }
  const winningArmy =
    game.gameWinner === null
      ? []
      : (lastBoards[game.gameWinner] ?? []).map((p) => ({ type: p.type, stars: p.stars }));
  return { winner: game.gameWinner, rounds: game.round, winningArmy };
}

/** Play one seed from both seatings: seat 0 preps first, then seat 1 first. */
export function playMirroredPair(seed: number, difficulty: AiDifficulty = 'normal'): MatchReport[] {
  return [playAiMatch({ seed, difficulty, first: 0 }), playAiMatch({ seed, difficulty, first: 1 })];
}

export interface BalanceSummary {
  games: number;
  /** Wins for side 0, side 1, and games with no winner. */
  wins: [number, number];
  draws: number;
  averageRounds: number;
  /** Appearances of each piece type at each star level across all winning armies. */
  appearances: Record<PieceType, Record<StarLevel, number>>;
  winningArmies: number;
}

export function summarize(reports: readonly MatchReport[]): BalanceSummary {
  const appearances = Object.fromEntries(
    PIECE_ORDER.map((t) => [t, { 1: 0, 2: 0, 3: 0 }]),
  ) as Record<PieceType, Record<StarLevel, number>>;
  const summary: BalanceSummary = {
    games: reports.length,
    wins: [0, 0],
    draws: 0,
    averageRounds: 0,
    appearances,
    winningArmies: 0,
  };
  let rounds = 0;
  for (const report of reports) {
    rounds += report.rounds;
    if (report.winner === null) {
      summary.draws += 1;
      continue;
    }
    summary.wins[report.winner] += 1;
    summary.winningArmies += 1;
    for (const piece of report.winningArmy) appearances[piece.type][piece.stars] += 1;
  }
  summary.averageRounds = reports.length === 0 ? 0 : rounds / reports.length;
  return summary;
}
