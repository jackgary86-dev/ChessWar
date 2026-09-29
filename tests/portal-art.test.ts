import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '../src/sim/battle.ts';
import { frameAt } from '../src/ui/animation.ts';
import type { UnitSnapshot } from '../src/ui/animation.ts';
import {
  PORTAL_LOOP_MS,
  burstRays,
  loopPhase,
  runePositions,
  swirlAngles,
} from '../src/ui/portal-art.ts';

describe('portal idle loop', () => {
  it('runs 0..1 through the loop and wraps', () => {
    expect(loopPhase(0, false)).toBe(0);
    expect(loopPhase(PORTAL_LOOP_MS / 2, false)).toBeCloseTo(0.5);
    expect(loopPhase(PORTAL_LOOP_MS, false)).toBe(0);
    expect(loopPhase(PORTAL_LOOP_MS * 3 + 1500, false)).toBeCloseTo(0.25);
  });

  it('holds still with reduced motion', () => {
    for (const t of [0, 123, 4567, 99999]) expect(loopPhase(t, true)).toBe(0);
    expect(swirlAngles(loopPhase(4000, true))).toEqual(swirlAngles(0));
    expect(runePositions(loopPhase(4000, true))).toEqual(runePositions(0));
  });

  it('loops seamlessly: phase 1 looks like phase 0', () => {
    const start = swirlAngles(0).map((a) => Math.cos(a));
    const end = swirlAngles(1).map((a) => Math.cos(a));
    end.forEach((v, i) => {
      expect(v).toBeCloseTo(start[i] ?? NaN);
    });
    const runes = runePositions(0).map((r) => r.toFixed(6));
    expect(runePositions(1).map((r) => r.toFixed(6))).toEqual(runes);
  });

  it('keeps runes on the bridge', () => {
    for (const phase of [0, 0.3, 0.99]) {
      for (const r of runePositions(phase)) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(1);
      }
    }
  });
});

describe('burstRays', () => {
  it('flies outward and shortens as it fades', () => {
    const early = burstRays(0.1);
    const late = burstRays(0.9);
    expect(early).toHaveLength(late.length);
    expect(late[0]?.inner).toBeGreaterThan(early[0]?.inner ?? Infinity);
    const lengths = (rays: typeof early): number => (rays[0]?.outer ?? 0) - (rays[0]?.inner ?? 0);
    expect(lengths(late)).toBeLessThan(lengths(early));
  });
});

describe('portal burst effect in the animation', () => {
  const snapshot: UnitSnapshot[] = [{ id: 0, type: 'R', side: 0, stars: 1, x: 7, y: 5, maxHp: 10 }];
  const events = [
    {
      kind: 'portal' as const,
      tick: 1,
      unit: 0,
      from: { x: 7, y: 5 },
      to: { x: 8, y: 5 },
    },
  ];

  it('bursts at both ends of a portal crossing, then stops', () => {
    const during = frameAt(snapshot, events, 0.5, false);
    const bursts = during.effects.filter((e) => e.kind === 'burst');
    expect(bursts.map((b) => (b.kind === 'burst' ? b.pos : null))).toEqual([
      { x: 7, y: 5 },
      { x: 8, y: 5 },
    ]);
    expect(frameAt(snapshot, events, 5, false).effects.filter((e) => e.kind === 'burst')).toEqual(
      [],
    );
  });

  it('shows a static burst with reduced motion', () => {
    const [a, b] = [0.3, 0.7].map(
      (t) => frameAt(snapshot, events, t, true).effects.filter((e) => e.kind === 'burst')[0],
    );
    expect(a).toEqual(b);
  });

  it('does not burst for a plain move', () => {
    const move: BattleEvent[] = [
      { kind: 'move', tick: 1, unit: 0, from: { x: 7, y: 5 }, to: { x: 8, y: 5 } },
    ];
    expect(frameAt(snapshot, move, 0.5, false).effects).toEqual([]);
  });
});
