/**
 * Save and resume through browser storage. Every storage call is wrapped in
 * try/catch: private windows, blocked site data or a full quota must never
 * stop the game, which then simply plays without saving.
 */
import type { GameState } from '@sim/game.ts';
import { isSavable, parseSave, serializeGame } from '@sim/save.ts';

export const SAVE_KEY = 'chesswar.save';

/** The slice of `Storage` used here, so tests can pass a fake. */
export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** The browser's localStorage, or null if even touching it throws. */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Save the game at the start of a prep phase. Returns whether it was written. */
export function saveGame(storage: StorageLike | null, game: GameState): boolean {
  if (!storage || !isSavable(game)) return false;
  try {
    storage.setItem(SAVE_KEY, serializeGame(game));
    return true;
  } catch {
    return false;
  }
}

/** The saved game, or null if there is none or it is unusable. */
export function loadGame(storage: StorageLike | null): GameState | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(SAVE_KEY);
    return text === null ? null : parseSave(text);
  } catch {
    return null;
  }
}

export function clearSave(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: the game plays on without a save.
  }
}
