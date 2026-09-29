import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '../src/sim/battle.ts';
import { frameAt } from '../src/ui/animation.ts';
import type { UnitSnapshot } from '../src/ui/animation.ts';
import {
  blessingMotes,
  fortressOutline,
  hitFlashAlpha,
  impactRays,
  jabReach,
  shatterShards,
  shieldArcs,
  strandOffsets,
  strikeStyle,
} from '../src/ui/vfx.ts';

const unit = (
  id: number,
  type: UnitSnapshot['type'],
  side: 0 | 1,
  x: number,
  y: number,
  stars: 1 | 2 | 3 = 1,
): UnitSnapshot => ({
  id,
  type,
  side,
  stars,
  x,
  y,
  maxHp: 10,
});

describe('strike styles', () => {
  it('gives each piece type a distinct look', () => {
    expect(strikeStyle('P').shape).toBe('jab');
    expect(strikeStyle('N').shape).toBe('impact');
    for (const t of ['B', 'R', 'Q'] as const) expect(strikeStyle(t).shape).toBe('line');
    expect(strikeStyle('R').width).toBeGreaterThan(strikeStyle('B').width);
    expect(strikeStyle('Q').strands).toBe(2);
  });

  it('centers strand offsets and jabs out and back', () => {
    expect(strandOffsets(1)).toEqual([0]);
    expect(strandOffsets(2).reduce((sum, v) => sum + v, 0)).toBeCloseTo(0);
    expect(jabReach(0)).toBe(0);
    expect(jabReach(1)).toBeCloseTo(0);
    expect(jabReach(0.5)).toBeGreaterThan(jabReach(0.25));
  });
});

const reach = (shards: readonly { dx: number; dy: number }[]): number => {
  const first = shards[0];
  return first ? Math.hypot(first.dx, first.dy) : 0;
};

describe('hit flash, shatter and ability parameters', () => {
  it('flashes and fades to nothing', () => {
    expect(hitFlashAlpha(0)).toBe(0);
    expect(hitFlashAlpha(1)).toBe(0);
    expect(hitFlashAlpha(0.2)).toBeGreaterThan(hitFlashAlpha(0.8));
  });

  it('shards fly outward and shrink away', () => {
    const early = shatterShards(0.1);
    const late = shatterShards(0.9);
    expect(early.length).toBe(late.length);
    expect(reach(late)).toBeGreaterThan(reach(early));
    expect(shatterShards(1).every((s) => s.size === 0)).toBe(true);
  });

  it('describes the ability effects', () => {
    expect(shieldArcs(0.5)).toHaveLength(3);
    expect(fortressOutline(0).width).toBeGreaterThan(fortressOutline(1).width);
    expect(blessingMotes(0.5).map((m) => m.dy)).not.toEqual(blessingMotes(0).map((m) => m.dy));
    expect(Math.min(...blessingMotes(0.5).map((m) => m.dy))).toBeLessThan(
      Math.min(...blessingMotes(0).map((m) => m.dy)),
    );
    expect(impactRays(0.5)).toHaveLength(8);
  });
});

describe('frameAt effects', () => {
  const strike = (
    attacker: number,
    target: number,
    via: 'strike' | 'fork' | 'pierce' = 'strike',
  ): BattleEvent => ({
    kind: 'strike',
    tick: 1,
    attacker,
    target,
    damage: 3,
    targetHp: 7,
    via,
  });

  it('draws a line strike with a flash for a bishop, an impact for a knight', () => {
    const bishop = frameAt(
      [unit(0, 'B', 0, 0, 0), unit(1, 'P', 1, 3, 3)],
      [strike(0, 1)],
      0.3,
      false,
    );
    expect(bishop.effects.map((e) => e.kind)).toEqual(expect.arrayContaining(['line', 'flash']));
    const knight = frameAt(
      [unit(0, 'N', 0, 0, 0), unit(1, 'P', 1, 1, 2)],
      [strike(0, 1)],
      0.3,
      false,
    );
    expect(knight.effects.map((e) => e.kind)).toContain('impact');
    expect(knight.effects.map((e) => e.kind)).not.toContain('line');
  });

  it('shows Fortress on a 2★ rook and Shield Wall on a guarded pawn only', () => {
    const rook = frameAt(
      [unit(0, 'B', 0, 0, 0), unit(1, 'R', 1, 3, 3, 2)],
      [strike(0, 1)],
      0.3,
      false,
    );
    expect(rook.effects).toContainEqual(
      expect.objectContaining({ kind: 'ability', ability: 'fortress' }),
    );
    const one = frameAt([unit(0, 'B', 0, 0, 0), unit(1, 'R', 1, 3, 3)], [strike(0, 1)], 0.3, false);
    expect(one.effects.map((e) => e.kind)).not.toContain('ability');
    const guarded = frameAt(
      [unit(0, 'B', 0, 0, 0), unit(1, 'P', 1, 3, 3, 2), unit(2, 'P', 1, 3, 4)],
      [strike(0, 1)],
      0.3,
      false,
    );
    expect(guarded.effects).toContainEqual(
      expect.objectContaining({ kind: 'ability', ability: 'shield' }),
    );
    const alone = frameAt(
      [unit(0, 'B', 0, 0, 0), unit(1, 'P', 1, 3, 3, 2)],
      [strike(0, 1)],
      0.3,
      false,
    );
    expect(alone.effects.map((e) => e.kind)).not.toContain('ability');
  });

  it('delays the fork branch and marks pierce', () => {
    const snap = [unit(0, 'N', 0, 0, 0, 2), unit(1, 'P', 1, 1, 2)];
    expect(
      frameAt(snap, [strike(0, 1, 'fork')], 0.1, false).effects.map((e) => e.kind),
    ).not.toContain('line');
    const fork = frameAt(snap, [strike(0, 1, 'fork')], 0.4, false);
    expect(fork.effects).toContainEqual(expect.objectContaining({ kind: 'line', via: 'fork' }));
    const pierce = frameAt(
      [unit(0, 'Q', 0, 0, 0, 3), unit(1, 'P', 1, 3, 3)],
      [strike(0, 1, 'pierce')],
      0.3,
      false,
    );
    expect(pierce.effects).toContainEqual(expect.objectContaining({ kind: 'line', via: 'pierce' }));
  });

  it('adds Blessing motes on a heal and a shatter on death, and skips shatter and flash for reduced motion', () => {
    const heal: BattleEvent = { kind: 'heal', tick: 1, healer: 0, target: 1, amount: 2 };
    const blessed = frameAt([unit(0, 'B', 0, 0, 0, 2), unit(1, 'P', 0, 1, 0)], [heal], 0.3, false);
    expect(blessed.effects).toContainEqual(
      expect.objectContaining({ kind: 'ability', ability: 'blessing' }),
    );
    const death: BattleEvent = { kind: 'death', tick: 1, unit: 1, pos: { x: 3, y: 3 } };
    const snap = [unit(0, 'B', 0, 0, 0), unit(1, 'P', 1, 3, 3)];
    expect(frameAt(snap, [death], 0.3, false).effects.map((e) => e.kind)).toContain('shatter');
    expect(frameAt(snap, [death], 0.3, true).effects.map((e) => e.kind)).not.toContain('shatter');
    expect(frameAt(snap, [strike(0, 1)], 0.3, true).effects.map((e) => e.kind)).not.toContain(
      'flash',
    );
  });
});
