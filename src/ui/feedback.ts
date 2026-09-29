/**
 * Feedback for prep-phase changes: a merge (on the bench or the board), a
 * player level-up and a shop buy. Pure functions over before/after snapshots,
 * so the wiring in `main.ts` stays thin and this stays unit-testable.
 */
import type { Holdings } from '@sim/shop.ts';
import type { Pos } from '@sim/board.ts';
import type { PieceType, StarLevel } from '@sim/types.ts';

export interface MergeFx {
  readonly type: PieceType;
  readonly stars: StarLevel;
  /** Where the merged piece now stands. */
  readonly where:
    | { readonly kind: 'board'; readonly pos: Pos }
    | { readonly kind: 'bench'; readonly slot: number };
}

export interface PrepFeedback {
  readonly merges: readonly MergeFx[];
  readonly levelUp: boolean;
}

/** Merged pieces: an owned piece whose star level rose, or that arrived already merged. */
export function detectPrepFeedback(
  before: Holdings,
  after: Holdings,
  levelBefore: number,
  levelAfter: number,
): PrepFeedback {
  const oldStars = new Map<number, StarLevel>();
  for (const p of [...before.board, ...before.bench]) if (p) oldStars.set(p.id, p.stars);
  const upgraded = (id: number, stars: StarLevel): boolean => {
    const was = oldStars.get(id);
    return was === undefined ? stars > 1 : stars > was;
  };
  const merges: MergeFx[] = [];
  for (const p of after.board) {
    if (upgraded(p.id, p.stars)) {
      merges.push({
        type: p.type,
        stars: p.stars,
        where: { kind: 'board', pos: { x: p.x, y: p.y } },
      });
    }
  }
  after.bench.forEach((p, slot) => {
    if (p && upgraded(p.id, p.stars)) {
      merges.push({ type: p.type, stars: p.stars, where: { kind: 'bench', slot } });
    }
  });
  return { merges, levelUp: levelAfter > levelBefore };
}

/** How long merge and level-up feedback lasts, in ms. */
export const FEEDBACK_MS = 900;

export interface TimedMerge {
  readonly pos: Pos;
  readonly stars: StarLevel;
  readonly startMs: number;
}

/** Board merge effects still running at `nowMs`, with their progress (0..1). */
export function activeMerges(
  timed: readonly TimedMerge[],
  nowMs: number,
): { pos: Pos; stars: StarLevel; progress: number }[] {
  return timed
    .filter((m) => nowMs - m.startMs < FEEDBACK_MS)
    .map((m) => ({
      pos: m.pos,
      stars: m.stars,
      progress: Math.max(0, (nowMs - m.startMs) / FEEDBACK_MS),
    }));
}
