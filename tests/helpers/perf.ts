/**
 * Measurements behind the performance bug check. Shared by `tests/performance.test.ts`
 * (small, loose budgets in CI) and `scripts/perf.ts` (`npm run perf`, full size).
 */
import { performance } from 'node:perf_hooks';
import { createBattle, stepBattle } from '@sim/battle.ts';
import { createRng } from '@sim/rng.ts';
import { playMirroredPair } from '@sim/match.ts';
import { frameAt, snapshotUnits } from '@ui/animation.ts';
import { ARMY_SEED_SALT, armiesFor } from './fuzz.ts';

/** A frame at 60 fps has 1000/60 ms; the renderer shares it with the sim replay. */
export const FRAME_BUDGET_MS = 1000 / 60;
/** Pieces on the board in the heaviest fight: a full 8 a side. */
export const FULL_BOARD_PIECES = 16;
const SEED_SCAN_LIMIT = 200;
const PLAYBACK_STEPS = 60;

/** Milliseconds `fn` takes to run once. */
export function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

/** Wall time to play `games` AI-vs-AI matches the way `npm run sim` does. */
export function simMs(games: number): number {
  return timeMs(() => {
    for (let played = 0, seed = 1; played < games; seed++) {
      played += playMirroredPair(seed).length;
    }
  });
}

/** A battle with 16 pieces on the board, run to its end, with its opening snapshot. */
export function fullBoardBattle(): {
  battle: ReturnType<typeof createBattle>;
  snapshot: ReturnType<typeof snapshotUnits>;
} {
  for (let seed = 1; seed < SEED_SCAN_LIMIT; seed++) {
    const armies = armiesFor(seed);
    if (armies.length !== FULL_BOARD_PIECES) continue;
    const battle = createBattle(armies, createRng(seed ^ ARMY_SEED_SALT));
    const snapshot = snapshotUnits(battle);
    while (!battle.finished) stepBattle(battle);
    return { battle, snapshot };
  }
  throw new Error('no 16-piece army in the scanned seeds');
}

/** Worst time to build one animation frame of the 16-piece fight, over its whole length. */
export function worstFrameMs(): number {
  const { battle, snapshot } = fullBoardBattle();
  let worst = 0;
  for (let step = 0; step <= PLAYBACK_STEPS; step++) {
    const t = (battle.tick * step) / PLAYBACK_STEPS;
    worst = Math.max(
      worst,
      timeMs(() => frameAt(snapshot, battle.events, t, false)),
    );
  }
  return worst;
}

/** Heap in bytes after a forced collection, or null when gc is unavailable. */
export function settledHeap(gc: (() => void) | null): number | null {
  if (!gc) return null;
  gc();
  return process.memoryUsage().heapUsed;
}
