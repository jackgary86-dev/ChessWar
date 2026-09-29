/**
 * Serialize and restore a match.
 *
 * A game is plain data (the RNG is a single integer), so a save is its JSON
 * with a version tag. Saves are taken at the start of a prep phase, when no
 * battle is in flight. `parseSave` checks the shape and returns null for
 * anything unusable, so a corrupt or outdated save can never crash the game.
 */
import { PIECE_ORDER, PLAYER } from './data.ts';
import type { GameState } from './game.ts';

const MAX_STARS = 3;

/** Bump when the saved shape changes; older saves are then ignored. */
export const SAVE_VERSION = 1;

interface SaveFile {
  readonly version: number;
  readonly game: GameState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isPiece(value: unknown): boolean {
  return (
    isRecord(value) &&
    isInt(value.id) &&
    typeof value.type === 'string' &&
    (PIECE_ORDER as readonly string[]).includes(value.type) &&
    isInt(value.stars) &&
    value.stars >= 1 &&
    value.stars <= MAX_STARS
  );
}

function isHoldings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { bench, board, nextId } = value;
  return (
    Array.isArray(bench) &&
    bench.length === PLAYER.benchSize &&
    bench.every((slot) => slot === null || isPiece(slot)) &&
    Array.isArray(board) &&
    board.every((p) => isPiece(p) && isRecord(p) && isInt(p.x) && isInt(p.y)) &&
    isInt(nextId)
  );
}

function isShop(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { slots, locked } = value;
  return (
    Array.isArray(slots) &&
    slots.length === PLAYER.shopSize &&
    slots.every(
      (s) =>
        s === null || (typeof s === 'string' && (PIECE_ORDER as readonly string[]).includes(s)),
    ) &&
    typeof locked === 'boolean'
  );
}

function isEconomy(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isInt(value.gold) &&
    isInt(value.level) &&
    value.level >= PLAYER.minLevel &&
    value.level <= PLAYER.maxLevel &&
    isInt(value.xp) &&
    isInt(value.streak) &&
    typeof value.lastWon === 'boolean'
  );
}

function isPlayer(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    isInt(value.hp) &&
    value.hp > 0 &&
    typeof value.isAI === 'boolean' &&
    isEconomy(value.econ) &&
    isHoldings(value.holdings) &&
    isShop(value.shop)
  );
}

function isPool(value: unknown): boolean {
  return isRecord(value) && PIECE_ORDER.every((type) => isInt(value[type]) && value[type] >= 0);
}

/** Only prep-start phases are saved, so those are the only ones restored. */
function isGame(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  const { players, rng } = value;
  return (
    (value.mode === 'ai' || value.mode === 'local') &&
    isInt(value.round) &&
    value.round >= 1 &&
    (value.phase === 'prep' || value.phase === 'handoff') &&
    (value.active === 0 || value.active === 1) &&
    Array.isArray(players) &&
    players.length === 2 &&
    players.every(isPlayer) &&
    isPool(value.pool) &&
    isRecord(rng) &&
    isInt(rng.state) &&
    value.battle === null
  );
}

/** Can this game be saved? Only the start of a prep phase, with no fight in flight. */
export function isSavable(game: GameState): boolean {
  return (game.phase === 'prep' || game.phase === 'handoff') && game.battle === null;
}

export function serializeGame(game: GameState): string {
  const file: SaveFile = { version: SAVE_VERSION, game };
  return JSON.stringify(file);
}

/** Restore a game from `serializeGame` output, or null if it is unusable. */
export function parseSave(text: string): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.version !== SAVE_VERSION) return null;
  const { game } = data;
  return isGame(game) ? game : null;
}
