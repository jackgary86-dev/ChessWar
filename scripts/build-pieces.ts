/**
 * Generate the ten piece sprites in `assets/pieces/` (npm run pieces).
 *
 * Both sides share one geometry per piece and differ only in colors, so the
 * shapes are defined once here. Style follows docs/art/STYLE_GUIDE.md: a
 * 64 x 64 viewBox, a shared plinth on y = 50..58, one 2.5-unit outline.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Piece = 'P' | 'N' | 'B' | 'R' | 'Q';
type Side = 'ivory' | 'ebony';

const COLORS: Record<Side, { fill: string; outline: string; highlight: string }> = {
  ivory: { fill: '#f1e9d4', outline: '#1c1914', highlight: '#cfc3a4' },
  ebony: { fill: '#2b271f', outline: '#ede5d1', highlight: '#4a4336' },
};

const PLINTH = '<rect x="15" y="50" width="34" height="8" rx="3.5"/>';

/** Filled, outlined shapes (drawn back to front) and one flat highlight stroke. */
const SHAPES: Record<Piece, { body: string; highlight: string; eye?: string }> = {
  P: {
    body: [
      '<path d="M21 50 Q24 40 27 35 L37 35 Q40 40 43 50 Z"/>',
      '<ellipse cx="32" cy="35" rx="10" ry="3.2"/>',
      '<circle cx="32" cy="24" r="8.5"/>',
    ].join(''),
    highlight: 'M27.5 22 Q29 18.5 33 18.5 M37 41 Q39.5 44 40.5 48',
  },
  R: {
    body: [
      '<path d="M23 23 H41 L43 44 H21 Z"/>',
      '<rect x="18" y="44" width="28" height="6" rx="2"/>',
      '<path d="M19 23 V10 H25 V15 H29.5 V10 H34.5 V15 H39 V10 H45 V23 Z"/>',
    ].join(''),
    highlight: 'M25 28 V40 M22 12.5 V19',
  },
  B: {
    body: [
      '<path d="M26 36 Q24 44 21 50 H43 Q40 44 38 36 Z"/>',
      '<path d="M32 12 C42 18 43 28 38 34 H26 C21 28 22 18 32 12 Z"/>',
      '<ellipse cx="32" cy="35" rx="11" ry="3.2"/>',
      '<circle cx="32" cy="8.5" r="3.5"/>',
    ].join(''),
    highlight: 'M27 27 Q26.5 21 30 17 M37 43 Q39 46 40 48',
    eye: '<path d="M32.5 17 L36 24" fill="none"/>',
  },
  N: {
    body: [
      '<path d="M21 50 C21 41 25 36 30 31 C27 30 24 32 21 35 C18 35 16 33 17 30 C19 24 24 15 32 11 L34 5 L38 11 C46 15 48 26 47 34 C46 42 45 46 44 50 Z"/>',
    ].join(''),
    highlight: 'M40 15 C43.5 20 44 27 42 33 M25 47 Q26 41 29 37',
    eye: '<circle cx="34.5" cy="19.5" r="1.8" stroke="none" class="eye"/>',
  },
  Q: {
    body: [
      '<path d="M25 36 Q23 44 21 50 H43 Q41 44 39 36 Z"/>',
      '<path d="M17 21 L23 35 H41 L47 21 L39 27 L36 11 L32 25 L28 11 L25 27 Z"/>',
      '<ellipse cx="32" cy="36" rx="10.5" ry="3.2"/>',
      '<circle cx="17" cy="19.5" r="2.6"/><circle cx="28" cy="9.5" r="2.6"/>',
      '<circle cx="36" cy="9.5" r="2.6"/><circle cx="47" cy="19.5" r="2.6"/>',
    ].join(''),
    highlight: 'M26 29 L26.5 31.5 M31 22 L32 18 M38 43 Q40 45 41 48',
  },
};

const NAMES: Record<Piece, string> = {
  P: 'Pawn',
  N: 'Knight',
  B: 'Bishop',
  R: 'Rook',
  Q: 'Queen',
};

export function pieceSvg(piece: Piece, side: Side): string {
  const c = COLORS[side];
  const shape = SHAPES[piece];
  const eye = shape.eye?.replace('class="eye"', `fill="${c.outline}"`) ?? '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128" role="img" aria-label="${side === 'ivory' ? 'Ivory' : 'Ebony'} ${NAMES[piece]}">`,
    `  <g stroke="${c.outline}" stroke-width="2.5" stroke-linejoin="round" fill="${c.fill}">`,
    `    ${PLINTH}`,
    `    ${shape.body}`,
    `    ${eye}`,
    '  </g>',
    `  <path d="${shape.highlight}" stroke="${c.highlight}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`,
    '</svg>',
    '',
  ].join('\n');
}

export const PIECES_LIST: readonly Piece[] = ['P', 'N', 'B', 'R', 'Q'];
export const SIDES_LIST: readonly Side[] = ['ivory', 'ebony'];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = new URL('../assets/pieces/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const piece of PIECES_LIST) {
    for (const side of SIDES_LIST) {
      writeFileSync(new URL(`${piece}-${side}.svg`, dir), pieceSvg(piece, side));
    }
  }
  console.log(`Wrote ${String(PIECES_LIST.length * SIDES_LIST.length)} sprites to assets/pieces/`);
}
