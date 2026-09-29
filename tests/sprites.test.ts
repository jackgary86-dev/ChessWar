import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PIECE_ORDER } from '../src/sim/data.ts';
import type { Side } from '../src/sim/types.ts';
import { pieceSprite, pieceSpriteUrl } from '../src/ui/sprites.ts';
import { PIECES_LIST, SIDES_LIST, pieceSvg } from '../scripts/build-pieces.ts';

const SIDE_NAMES: readonly Side[] = [0, 1];

function file(type: string, side: string): string {
  return readFileSync(new URL(`../assets/pieces/${type}-${side}.svg`, import.meta.url), 'utf8');
}

/** The geometry of a sprite: everything except the colors. */
function shape(svg: string): string {
  return svg.replace(/#[0-9a-f]{6}/gi, '#');
}

describe('piece sprites', () => {
  it('has all 10 files, in sync with the generator', () => {
    expect(PIECES_LIST).toEqual(PIECE_ORDER);
    for (const type of PIECES_LIST) {
      for (const side of SIDES_LIST) {
        expect(file(type, side)).toBe(pieceSvg(type, side));
      }
    }
  });

  it('uses one viewBox, one plinth baseline and a transparent background', () => {
    for (const type of PIECES_LIST) {
      for (const side of SIDES_LIST) {
        const svg = file(type, side);
        expect(svg).toContain('viewBox="0 0 64 64"');
        expect(svg).toContain('<rect x="15" y="50" width="34" height="8" rx="3.5"/>');
        expect(svg).not.toMatch(/<rect[^>]*width="64"[^>]*height="64"/);
      }
    }
  });

  it('gives Ivory and Ebony the same geometry, differing only in color', () => {
    for (const type of PIECES_LIST) {
      expect(shape(file(type, 'ivory'))).toBe(shape(file(type, 'ebony')).replace('Ebony', 'Ivory'));
      expect(file(type, 'ivory')).not.toBe(file(type, 'ebony'));
    }
  });

  it('maps every piece and side to its own url', () => {
    const urls = new Set<string>();
    for (const type of PIECE_ORDER) {
      for (const side of SIDE_NAMES) urls.add(pieceSpriteUrl(type, side) ?? '');
    }
    expect(urls.size).toBe(PIECE_ORDER.length * SIDE_NAMES.length);
    expect(urls.has('')).toBe(false);
  });

  it('returns null where images are unavailable so the glyph is used', () => {
    expect(pieceSprite('Q', 0)).toBeNull();
  });
});
