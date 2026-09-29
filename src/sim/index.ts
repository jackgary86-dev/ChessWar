/**
 * Pure, deterministic game simulation.
 *
 * Nothing in this folder may touch the DOM, timers, `Math.random` or `Date.now`
 * (enforced by ESLint). All randomness comes from the seeded RNG in `rng.ts`,
 * and every balance number lives in `data.ts`.
 *
 * Modules arrive with the M1 and M2 tickets:
 *   types.ts, data.ts, rng.ts, board.ts, battle.ts,
 *   economy.ts, shop.ts, ai.ts, game.ts
 */
export * from './battle.ts';
export * from './board.ts';
export * from './economy.ts';
export * from './pathfinding.ts';
export * from './rng.ts';
export * from './shop.ts';
export const GAME_NAME = 'Chess War';
