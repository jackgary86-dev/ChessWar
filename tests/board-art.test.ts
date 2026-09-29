import { describe, expect, it } from 'vitest';
import { boardRect, wallCaps, wallRect } from '../src/ui/board-art.ts';
import type { Rect } from '../src/ui/board-art.ts';
import { computeLayout } from '../src/ui/layout.ts';

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe.each([
  ['side by side', false],
  ['stacked', true],
])('board art geometry (%s)', (_name, stacked) => {
  const layout = computeLayout(stacked ? 360 : 1040, stacked ? 720 : 520, stacked);
  const first = boardRect(layout, 0);
  const second = boardRect(layout, 1);
  const wall = wallRect(layout);

  it('gives each board an 8×8 area', () => {
    for (const r of [first, second]) {
      const [long, short] = stacked ? [r.h, r.w] : [r.w, r.h];
      expect(long).toBe(layout.cell * 8);
      expect(short).toBe(layout.cell * 8);
    }
  });

  it('puts the wall exactly between the boards without overlapping them', () => {
    expect(overlaps(first, second)).toBe(false);
    expect(overlaps(wall, first)).toBe(false);
    expect(overlaps(wall, second)).toBe(false);
    if (stacked) {
      expect(wall.y).toBe(second.y + second.h);
      expect(first.y).toBe(wall.y + wall.h);
    } else {
      expect(wall.x).toBe(first.x + first.w);
      expect(second.x).toBe(wall.x + wall.w);
    }
  });

  it('covers the whole canvas with boards and wall', () => {
    const area = first.w * first.h + second.w * second.h + wall.w * wall.h;
    expect(area).toBe(layout.width * layout.height);
  });

  it('centers a cap on each end of the wall, wider than the wall', () => {
    const caps = wallCaps(layout);
    for (const cap of caps) {
      if (stacked) {
        expect(cap.y + cap.h / 2).toBeCloseTo(wall.y + wall.h / 2);
        expect(cap.h).toBeGreaterThan(wall.h);
      } else {
        expect(cap.x + cap.w / 2).toBeCloseTo(wall.x + wall.w / 2);
        expect(cap.w).toBeGreaterThan(wall.w);
      }
      expect(overlaps(cap, wall)).toBe(true);
    }
    expect(overlaps(caps[0], caps[1])).toBe(false);
    // Caps sit at the two ends of the wall's length.
    if (stacked) {
      expect(caps[0].x).toBe(0);
      expect(caps[1].x + caps[1].w).toBeCloseTo(layout.width);
    } else {
      expect(caps[0].y).toBe(0);
      expect(caps[1].y + caps[1].h).toBeCloseTo(layout.height);
    }
  });
});
