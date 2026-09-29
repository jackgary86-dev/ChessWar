import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moveCursor, isActivateKey } from '@ui/input.ts';
import { BOARD } from '@sim/data.ts';

const css = readFileSync(new URL('../src/ui/theme.css', import.meta.url), 'utf8');

/** All `--name: #rrggbb` custom properties in the theme. */
const colors = new Map<string, string>();
for (const [, name, hex] of css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
  if (name && hex) colors.set(name, hex);
}
const color = (name: string): string => {
  const value = colors.get(name);
  if (!value) throw new Error(`theme.css has no --${name}`);
  return value;
};

const HEX_RADIX = 16;
const BYTE = 255;
const LINEAR_THRESHOLD = 0.03928;
const LINEAR_OFFSET = 0.055;
const LINEAR_SCALE = 1.055;
const LINEAR_GAMMA = 2.4;
const LINEAR_LOW_DIVISOR = 12.92;
const WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
const GLARE = 0.05;

function luminance(hex: string): number {
  return WEIGHTS.reduce((sum, weight, i) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), HEX_RADIX) / BYTE;
    const linear =
      c <= LINEAR_THRESHOLD
        ? c / LINEAR_LOW_DIVISOR
        : ((c + LINEAR_OFFSET) / LINEAR_SCALE) ** LINEAR_GAMMA;
    return sum + weight * linear;
  }, 0);
}

/** WCAG 2.x contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + GLARE) / ((lo ?? 0) + GLARE);
}

const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;

describe('text contrast (WCAG AA, 4.5:1)', () => {
  it.each([
    ['ink', 'ground'],
    ['ink', 'panel'],
    ['ink', 'panel-2'],
    ['muted', 'ground'],
    ['muted', 'panel'],
    ['muted', 'panel-2'],
    ['brass', 'ground'],
    ['brass', 'panel'],
    ['brass-ink', 'brass'],
    ['ivory', 'panel-2'],
    ['t1', 'panel-2'],
    ['t2', 'panel-2'],
    ['t3', 'panel-2'],
    ['t4', 'panel-2'],
    ['t1', 'panel'],
    ['t2', 'panel'],
    ['t3', 'panel'],
    ['t4', 'panel'],
  ])('%s on %s', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('sides without colour', () => {
  it('ivory and ebony pieces differ strongly in lightness, not only hue', () => {
    expect(contrast(color('ivory'), color('ebony'))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(['sq-light-1', 'sq-dark-1', 'sq-light-2', 'sq-dark-2'])(
    'a piece outline stays visible on %s',
    (square) => {
      // Each piece is drawn with an under-stroke of the opposite colour (render.ts),
      // so at least one of the two piece colours reads against every square.
      const best = Math.max(
        contrast(color('ivory'), color(square)),
        contrast(color('ebony'), color(square)),
      );
      expect(best).toBeGreaterThanOrEqual(AA_GRAPHIC);
    },
  );
});

describe('keyboard', () => {
  it('shows a focus ring on every kind of control', () => {
    for (const selector of [
      'button:focus-visible',
      'input:focus-visible',
      'canvas.battlefield:focus-visible',
    ]) {
      expect(css).toContain(selector);
    }
  });

  it('moves the board cursor with the arrow keys and keeps it on the player’s own half', () => {
    const half = BOARD.width / 2;
    expect(moveCursor(null, 0, 'ArrowRight')).toEqual({ x: 0, y: 0 });
    expect(moveCursor(null, 1, 'ArrowDown')).toEqual({ x: BOARD.wallRightX, y: 0 });
    expect(moveCursor({ x: 0, y: 0 }, 0, 'ArrowLeft')).toEqual({ x: 0, y: 0 });
    expect(moveCursor({ x: 0, y: 0 }, 0, 'ArrowUp')).toEqual({ x: 0, y: 0 });
    expect(moveCursor({ x: half - 1, y: BOARD.height - 1 }, 0, 'ArrowRight')).toEqual({
      x: half - 1,
      y: BOARD.height - 1,
    });
    expect(moveCursor({ x: BOARD.wallRightX, y: 2 }, 1, 'ArrowLeft')).toEqual({
      x: BOARD.wallRightX,
      y: 2,
    });
    expect(moveCursor({ x: 1, y: 1 }, 0, 'ArrowDown')).toEqual({ x: 1, y: 2 });
    expect(moveCursor({ x: 1, y: 1 }, 0, 'a')).toBeNull();
  });

  it('treats Enter and Space as a tap', () => {
    expect(isActivateKey('Enter')).toBe(true);
    expect(isActivateKey(' ')).toBe(true);
    expect(isActivateKey('Tab')).toBe(false);
  });
});

describe('reduced motion', () => {
  it('gates every CSS animation on the no-preference media query', () => {
    const withoutGated = css.replace(
      /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/g,
      '',
    );
    expect(withoutGated).not.toMatch(/^\s*animation(-name)?:/m);
    expect(withoutGated).not.toMatch(/^\s*transition:/m);
  });
});
