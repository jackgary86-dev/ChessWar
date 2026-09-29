/**
 * The playable demo: a short vs-AI slice switched on with `?demo`.
 *
 * Pure functions, so the flag, the round limit and the guided first-round
 * tips are unit-testable. `main.ts` wires them to the page.
 */
import type { GameState } from '@sim/game.ts';
import type { Holdings } from '@sim/shop.ts';

/** The demo ends after this many rounds (or sooner if a commander falls). */
export const DEMO_ROUNDS = 5;
/** Copies of one piece needed for a merge. */
const MERGE_COPIES = 3;

/** True when the URL query string carries a `demo` flag (`?demo`, `?demo=1`), unless `demo=0`. */
export function isDemo(search: string): boolean {
  const value = new URLSearchParams(search).get('demo');
  return value !== null && value !== '0' && value !== 'false';
}

/** The page address without the demo flag, for the "play the full game" link. */
export function fullGameHref(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('demo');
  return url.toString();
}

/** True once the round just fought was the last one of the demo. */
export function demoFinished(game: GameState): boolean {
  return game.phase === 'over' || (game.phase === 'result' && game.round >= DEMO_ROUNDS);
}

export type TipStep = 'shop' | 'place' | 'portals';

export interface DemoTip {
  readonly step: TipStep;
  readonly text: string;
}

function owned(holdings: Readonly<Holdings>): number {
  return holdings.board.length + holdings.bench.filter((p) => p !== null).length;
}

function hasPairOfCopies(holdings: Readonly<Holdings>): boolean {
  const counts = new Map<string, number>();
  for (const p of [...holdings.board, ...holdings.bench]) {
    if (p)
      counts.set(
        `${p.type}${String(p.stars)}`,
        (counts.get(`${p.type}${String(p.stars)}`) ?? 0) + 1,
      );
  }
  return [...counts.values()].some((n) => n === MERGE_COPIES - 1);
}

/**
 * The hint for the human's first prep phase, or null once the demo is past
 * round 1 (or a fight is on). Each step names the one thing to do next.
 */
export function demoTip(game: GameState): DemoTip | null {
  if (game.round !== 1 || game.phase !== 'prep') return null;
  const { holdings } = game.players[game.active];
  if (holdings.board.length > 0) {
    return {
      step: 'portals',
      text: 'Pieces cross the wall only through the glowing portal squares (Knights leap it anywhere). Press Fight when ready.',
    };
  }
  if (owned(holdings) > 0) {
    return {
      step: 'place',
      text: 'Placement: tap a piece on your bench, then a green square on your half of the board (or drag it there).',
    };
  }
  return {
    step: 'shop',
    text: `Shop: tap a card to buy a piece with your gold. Buy ${String(MERGE_COPIES)} copies of one piece to merge them into a stronger ★★.`,
  };
}

/** Merge hint shown beside the main tip once two copies of a piece are held. */
export function mergeNudge(game: GameState): string | null {
  if (game.round !== 1 || game.phase !== 'prep') return null;
  return hasPairOfCopies(game.players[game.active].holdings)
    ? 'Two matching pieces: one more copy merges them into a ★★.'
    : null;
}
