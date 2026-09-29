import { describe, expect, it } from 'vitest';
import { BOARD } from '../src/sim/data.ts';
import { computeLayout, shouldStack, STACK_BREAKPOINT_PX } from '../src/ui/layout.ts';

describe.each([false, true])('layout (stacked: %s)', (stacked) => {
  const layout = computeLayout(800, 800, stacked);

  it('fromScreen inverts toScreen for every square', () => {
    for (let x = 0; x < BOARD.width; x++) {
      for (let y = 0; y < BOARD.height; y++) {
        const at = layout.toScreen({ x, y });
        const mid = layout.cell / 2;
        expect(layout.fromScreen(at.x + mid, at.y + mid)).toEqual({ x, y });
      }
    }
  });

  it('returns null over the wall and outside the canvas', () => {
    const a = layout.toScreen({ x: BOARD.wallLeftX, y: 0 });
    const b = layout.toScreen({ x: BOARD.wallRightX, y: 0 });
    const gapMid = layout.stacked
      ? { px: 1, py: Math.min(a.y, b.y) + layout.cell + layout.wallGap / 2 }
      : { px: Math.min(a.x, b.x) + layout.cell + layout.wallGap / 2, py: 1 };
    expect(layout.fromScreen(gapMid.px, gapMid.py)).toBeNull();
    expect(layout.fromScreen(-1, 0)).toBeNull();
    expect(layout.fromScreen(layout.width + 1, 0)).toBeNull();
  });

  it('fits inside the requested box', () => {
    expect(layout.width).toBeLessThanOrEqual(800);
    expect(layout.height).toBeLessThanOrEqual(800);
  });
});

describe('orientation', () => {
  it('puts boards side by side on desktop, Ivory on the left', () => {
    const layout = computeLayout(1000, 600, false);
    expect(layout.width).toBeGreaterThan(layout.height);
    expect(layout.toScreen({ x: 0, y: 0 }).x).toBeLessThan(layout.toScreen({ x: 15, y: 0 }).x);
  });

  it('stacks vertically on phones with Ivory at the bottom', () => {
    const layout = computeLayout(390, 800, true);
    expect(layout.height).toBeGreaterThan(layout.width);
    expect(layout.toScreen({ x: 0, y: 0 }).y).toBeGreaterThan(layout.toScreen({ x: 15, y: 0 }).y);
  });

  it('stacks under the breakpoint only', () => {
    expect(shouldStack(STACK_BREAKPOINT_PX - 1)).toBe(true);
    expect(shouldStack(STACK_BREAKPOINT_PX)).toBe(false);
  });
});
