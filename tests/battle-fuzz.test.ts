/**
 * Fuzz test for the battle simulation (QA ticket). CI runs a few hundred seeded
 * random battles; `npm run fuzz` runs the full 10,000.
 */
import { describe, expect, it } from 'vitest';

import { runBattle } from '@sim/battle.ts';
import { BATTLE, BOARD } from '@sim/data.ts';
import { sideOfX } from '@sim/board.ts';
import { createRng } from '@sim/rng.ts';
import { ARMY_SEED_SALT, armiesFor, fuzz } from './helpers/fuzz.ts';

const CI_BATTLES = 300;
const REPLAY_BATTLES = 100;
const SLOW_TEST_MS = 60_000;

describe('battle fuzz', () => {
  it(
    `keeps every invariant across ${String(CI_BATTLES)} random battles`,
    () => {
      expect(fuzz(CI_BATTLES)).toBeLessThanOrEqual(BATTLE.maxTicks);
    },
    SLOW_TEST_MS,
  );

  it(
    'replays identically from the same seed',
    () => {
      for (let seed = 1; seed <= REPLAY_BATTLES; seed++) {
        const run = (): string => {
          const s = runBattle(armiesFor(seed), createRng(seed ^ ARMY_SEED_SALT));
          return JSON.stringify([s.tick, s.winner, s.endReason, s.events]);
        };
        expect(run(), `seed ${String(seed)}`).toBe(run());
      }
    },
    SLOW_TEST_MS,
  );

  it('generates valid armies (sanity check of the generator)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const army = armiesFor(seed);
      const squares = new Set(army.map((p) => `${String(p.pos.x)},${String(p.pos.y)}`));
      expect(squares.size).toBe(army.length);
      expect(army.some((p) => sideOfX(p.pos.x) === 0)).toBe(true);
      expect(army.some((p) => sideOfX(p.pos.x) === 1)).toBe(true);
      expect(army.every((p) => p.pos.x >= 0 && p.pos.x < BOARD.width)).toBe(true);
    }
  });
});
