/**
 * How a piece's star level is drawn, so it reads at a glance and not only from
 * the pips (docs/art/STYLE_GUIDE.md: star level is shape, not color alone).
 *
 * - 1★: plain piece, one bronze pip.
 * - 2★: silver ring around the plinth, two silver pips.
 * - 3★: gold ring with a glow, three gold pips.
 *
 * Pure data and geometry; `render.ts` does the drawing.
 */
import type { StarLevel } from '@sim/types.ts';

export interface StarStyle {
  /** Ring around the plinth, or null for a plain 1★ piece. */
  readonly ring: string | null;
  readonly pip: string;
  /** Glow color behind the piece, or null. */
  readonly glow: string | null;
  readonly pips: number;
}

const BRONZE = '#c58b4d';
const SILVER = '#c9ced6';
const GOLD = '#e2aa3a';

const STYLES: Readonly<Record<StarLevel, StarStyle>> = {
  1: { ring: null, pip: BRONZE, glow: null, pips: 1 },
  2: { ring: SILVER, pip: SILVER, glow: null, pips: 2 },
  3: { ring: GOLD, pip: GOLD, glow: GOLD, pips: 3 },
};

export function starStyle(stars: StarLevel): StarStyle {
  return STYLES[stars];
}

/** X offsets from the piece's center for `count` pips spaced `spacing` apart. */
export function pipOffsets(count: number, spacing: number): number[] {
  const first = (-(count - 1) * spacing) / 2;
  return Array.from({ length: count }, (_, i) => first + i * spacing);
}
