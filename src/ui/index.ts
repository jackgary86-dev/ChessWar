/**
 * Browser presentation layer: canvas renderer, input handling and DOM HUD.
 *
 * Modules arrive with the M3 tickets: render.ts, input.ts, hud.ts.
 * This layer may read simulation state but must never mutate it directly;
 * all changes go through the round-flow API in `sim/game.ts`.
 */
export {};
