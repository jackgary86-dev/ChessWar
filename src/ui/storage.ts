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

export interface SaveRead {
  /** The saved game, or null if there is none or it is unusable. */
  readonly game: GameState | null;
  /** A save was found but could not be used (corrupt or from another version) and was removed. */
  readonly discarded: boolean;
}

/** What the player is told when a save has to be thrown away. */
export const DISCARDED_SAVE_MESSAGE =
  'Your saved war could not be read (it is damaged or from an older version), so it was discarded.';

/** Read the save; an unusable one is removed so it is not offered again. */
export function readSave(storage: StorageLike | null): SaveRead {
  if (!storage) return { game: null, discarded: false };
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { game: null, discarded: false };
  }
  if (text === null) return { game: null, discarded: false };
  const game = parseSave(text);
  if (game) return { game, discarded: false };
  clearSave(storage);
  return { game: null, discarded: true };
}

/** The saved game, or null if there is none or it is unusable. */
export function loadGame(storage: StorageLike | null): GameState | null {
  return readSave(storage).game;
}

export function clearSave(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: the game plays on without a save.
  }
}
