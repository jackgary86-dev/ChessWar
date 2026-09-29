/**
 * Random armies and per-tick invariant checks for the battle fuzz test. Shared by
 * `tests/battle-fuzz.test.ts` (a few hundred battles in CI) and `scripts/fuzz.ts`
 * (`npm run fuzz`, 10,000 battles). A failure message carries the seed, so it can
 * be filed as a bug and replayed with `armiesFor(seed)`.
 */
import { createBattle, stepBattle } from '@sim/battle.ts';
import type { ArmyPiece, BattleState } from '@sim/battle.ts';
import { BATTLE, BOARD, PIECE_ORDER, PLAYER } from '@sim/data.ts';
import { inBounds, sideOfX, stepAllowed } from '@sim/board.ts';
import type { Pos } from '@sim/board.ts';
import { createRng, int } from '@sim/rng.ts';
import type { StarLevel } from '@sim/types.ts';

const MIN_PIECES = 1;
const STAR_LEVELS = 3;
const HALF_WIDTH = BOARD.width / 2;
export const ARMY_SEED_SALT = 0x9e3779b1;

/** Random armies for a seed: 1..8 pieces a side on their own half, distinct squares. */
export function armiesFor(seed: number): ArmyPiece[] {
  const rng = createRng(seed);
  const army: ArmyPiece[] = [];
  for (const side of [0, 1] as const) {
    const squares: Pos[] = [];
    for (let x = 0; x < HALF_WIDTH; x++) {
      for (let y = 0; y < BOARD.height; y++) squares.push({ x: side * HALF_WIDTH + x, y });
    }
    const count = MIN_PIECES + int(rng, PLAYER.maxBoardPieces - MIN_PIECES + 1);
    for (let i = 0; i < count; i++) {
      const [pos] = squares.splice(int(rng, squares.length), 1);
      const type = PIECE_ORDER[int(rng, PIECE_ORDER.length)];
      if (!pos || !type) throw new Error('unreachable: army generation');
      army.push({ type, stars: (1 + int(rng, STAR_LEVELS)) as StarLevel, pos });
    }
  }
  return army;
}

/** Every one-square step of a straight or diagonal move from `from` to `to`. */
function stepsOf(from: Pos, to: Pos): [Pos, Pos][] {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const steps: [Pos, Pos][] = [];
  let at = from;
  while (at.x !== to.x || at.y !== to.y) {
    const nextPos = { x: at.x + dx, y: at.y + dy };
    steps.push([at, nextPos]);
    at = nextPos;
  }
  return steps;
}

/** Throws a message naming the seed if any per-tick invariant is broken. */
export function checkBattle(seed: number): BattleState {
  const state = createBattle(armiesFor(seed), createRng(seed ^ ARMY_SEED_SALT));
  const fail = (what: string): never => {
    throw new Error(`seed ${String(seed)}: ${what} at tick ${String(state.tick)}`);
  };
  while (!state.finished) {
    const before = new Map(state.units.map((u) => [u.id, { x: u.x, y: u.y }]));
    stepBattle(state);
    const taken = new Set<number>();
    for (const u of state.units) {
      if (u.hp > u.maxHp) fail(`unit ${String(u.id)} hp ${String(u.hp)} above max`);
      if (u.hp < 0) fail(`unit ${String(u.id)} hp ${String(u.hp)} below 0`);
      if (u.hp === 0) continue;
      if (!inBounds(u)) fail(`unit ${String(u.id)} off the grid at ${String(u.x)},${String(u.y)}`);
      const key = u.y * BOARD.width + u.x;
      if (taken.has(key)) fail(`two pieces on ${String(u.x)},${String(u.y)}`);
      taken.add(key);
      const was = before.get(u.id);
      if (was && u.type !== 'N' && sideOfX(was.x) !== sideOfX(u.x)) {
        for (const [a, b] of stepsOf(was, u)) {
          if (!stepAllowed(a, b))
            fail(`unit ${String(u.id)} (${u.type}) crossed the wall off a portal`);
        }
      }
    }
  }
  return state;
}

/** Check seeds 1..count; returns the longest fight in ticks. Throws on the first failure. */
export function fuzz(count: number): number {
  let longest = 0;
  for (let seed = 1; seed <= count; seed++) {
    const state = checkBattle(seed);
    longest = Math.max(longest, state.tick);
    if (state.tick > BATTLE.maxTicks) {
      throw new Error(`seed ${String(seed)}: ended at tick ${String(state.tick)}`);
    }
    if (state.endReason === null) throw new Error(`seed ${String(seed)}: no end reason`);
  }
  return longest;
}
