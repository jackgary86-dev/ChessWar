import { describe, expect, it } from 'vitest';

import { createAiPrep } from '@sim/ai.ts';
import {
  buyCard,
  confirmHandoff,
  createGame,
  nextRound,
  placePiece,
  ready,
  rerollShop,
  skipCombat,
} from '@sim/game.ts';
import type { GameMode, GameState } from '@sim/game.ts';
import { SAVE_VERSION, isSavable, parseSave, serializeGame } from '@sim/save.ts';
import { SAVE_KEY, clearSave, loadGame, saveGame } from '../src/ui/storage.ts';
import type { StorageLike } from '../src/ui/storage.ts';

const SEED = 17;
const ROUNDS = 3;
const aiPrep = createAiPrep('normal');

function newGame(mode: GameMode = 'ai'): GameState {
  return createGame({ mode, seed: SEED }, aiPrep);
}

/** Play a scripted round for the human: buy everything, place what fits, fight. */
function playRound(game: GameState): void {
  for (let slot = 0; slot < game.players[0].shop.slots.length; slot++) buyCard(game, 0, slot);
  let x = 0;
  for (const piece of game.players[0].holdings.bench) {
    if (piece) placePiece(game, 0, piece.id, x++, 1);
  }
  rerollShop(game, 0);
  ready(game);
  skipCombat(game);
}

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('serialize and parse', () => {
  it('round-trips a game exactly, including RNG and pool state', () => {
    const game = newGame();
    playRound(game);
    nextRound(game, aiPrep);
    const restored = parseSave(serializeGame(game));
    expect(restored).toEqual(game);
    expect(restored?.rng.state).toBe(game.rng.state);
  });

  it('a resumed game plays out identically to the original', () => {
    const original = newGame();
    for (let i = 0; i < ROUNDS; i++) {
      playRound(original);
      nextRound(original, aiPrep);
    }
    const saved = serializeGame(original);
    const resumed = parseSave(saved);
    if (!resumed) throw new Error('save did not parse');
    for (const game of [original, resumed]) playRound(game);
    expect(resumed.result).toEqual(original.result);
    expect(resumed.battle?.events).toEqual(original.battle?.events);
    expect(resumed.players.map((p) => p.hp)).toEqual(original.players.map((p) => p.hp));
    expect(resumed.rng).toEqual(original.rng);
  });

  it('saves a hot-seat game at the handoff and restores it there', () => {
    const game = newGame('local');
    const restored = parseSave(serializeGame(game));
    expect(restored?.phase).toBe('handoff');
    if (restored) expect(confirmHandoff(restored)).toBe(true);
  });

  it('only saves at the start of a prep phase', () => {
    const game = newGame();
    expect(isSavable(game)).toBe(true);
    ready(game);
    expect(isSavable(game)).toBe(false);
  });

  it('rejects unusable saves instead of throwing', () => {
    const good = JSON.parse(serializeGame(newGame())) as {
      version: number;
      game: Record<string, unknown>;
    };
    const mutate = (
      change: (g: Record<string, unknown>) => void,
      version = SAVE_VERSION,
    ): string => {
      const copy = structuredClone(good);
      change(copy.game);
      return JSON.stringify({ version, game: copy.game });
    };
    expect(parseSave('not json')).toBeNull();
    expect(parseSave('null')).toBeNull();
    expect(parseSave('{}')).toBeNull();
    expect(parseSave(mutate(() => undefined, SAVE_VERSION + 1))).toBeNull();
    expect(parseSave(mutate((g) => (g.phase = 'combat')))).toBeNull();
    expect(parseSave(mutate((g) => (g.mode = 'online')))).toBeNull();
    expect(parseSave(mutate((g) => delete g.players))).toBeNull();
    expect(parseSave(mutate((g) => (g.rng = { state: 'x' })))).toBeNull();
    expect(parseSave(mutate((g) => (g.round = 0)))).toBeNull();
    expect(
      parseSave(
        mutate((g) => {
          const players = g.players as { holdings: { bench: unknown[] } }[];
          players[0]?.holdings.bench.pop();
        }),
      ),
    ).toBeNull();
    expect(parseSave(mutate(() => undefined))).not.toBeNull();
  });
});

describe('storage wrappers', () => {
  it('saves, loads and clears through storage', () => {
    const storage = fakeStorage();
    const game = newGame();
    expect(loadGame(storage)).toBeNull();
    expect(saveGame(storage, game)).toBe(true);
    expect(loadGame(storage)).toEqual(game);
    clearSave(storage);
    expect(loadGame(storage)).toBeNull();
  });

  it('does not save mid-fight', () => {
    const storage = fakeStorage();
    const game = newGame();
    ready(game);
    expect(saveGame(storage, game)).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  it('ignores a corrupt save', () => {
    const storage = fakeStorage();
    storage.setItem(SAVE_KEY, '{"version":1,"game":{"oops":true}}');
    expect(loadGame(storage)).toBeNull();
  });

  it('plays on when storage is missing or throws', () => {
    const game = newGame();
    expect(saveGame(null, game)).toBe(false);
    expect(loadGame(null)).toBeNull();
    expect(saveGame(throwingStorage, game)).toBe(false);
    expect(loadGame(throwingStorage)).toBeNull();
    expect(() => {
      clearSave(throwingStorage);
      clearSave(null);
    }).not.toThrow();
  });
});
