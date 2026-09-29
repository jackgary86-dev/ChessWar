/**
 * The playable demo: `?demo` on the page URL. Vs AI only, a fixed number of
 * rounds, a guided first round and an end screen that invites a full game.
 * Everything here is a pure function of the URL and the game, so it is
 * unit-testable; `main.ts` wires it up.
 */
import type { GameState } from '@sim/game.ts';

/** Rounds played before the demo ends. */
export const DEMO_ROUNDS = 5;

/** Tips shown one at a time during the first prep phase. */
export const DEMO_TIPS: readonly string[] = [
  'Shop: tap a card to buy a piece. Rerolling costs 2 gold, and XP raises your level and how many pieces you can field.',
  'Placement: tap a piece on your bench, then a square on your own board (or drag it). Pieces on the bench do not fight.',
  'Portals: the wall splits the boards. Only the glowing squares on ranks 3 and 6 let pieces cross it, and knights leap it anywhere.',
  'Merging: three copies of the same piece merge into a stronger ★★, and three ★★ into a ★★★ with a new ability.',
  'Ready? Press Fight. Both armies move and strike on their own; the loser of each round loses HP.',
];

/** True when the page was opened with the demo flag, e.g. `?demo` or `?demo=1`. */
export function isDemoUrl(search: string): boolean {
  return new URLSearchParams(search).has('demo');
}

/** The same page address without the demo flag, for the "play the full game" link. */
export function fullGameUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('demo');
  return url.toString();
}

/** The tip to show now, or null when there is none (after round 1, or all read). */
export function demoTip(game: GameState, tipIndex: number): { text: string; last: boolean } | null {
  if (game.round !== 1 || game.phase !== 'prep') return null;
  const text = DEMO_TIPS[tipIndex];
  return text === undefined ? null : { text, last: tipIndex === DEMO_TIPS.length - 1 };
}

/** The demo is over once the last demo round's result is dismissed, or the war ended sooner. */
export function demoIsOver(game: GameState, resultDismissed: boolean): boolean {
  return game.phase === 'over' || (resultDismissed && game.round >= DEMO_ROUNDS);
}

/** How the demo went for the player (Player 1), by remaining HP. */
export function demoOutcome(game: GameState): 'win' | 'lose' | 'draw' {
  const [you, them] = game.players;
  if (you.hp === them.hp) return 'draw';
  return you.hp > them.hp ? 'win' : 'lose';
}
