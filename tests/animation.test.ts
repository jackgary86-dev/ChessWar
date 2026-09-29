import { describe, expect, it } from 'vitest';

import { createBattle, stepBattle } from '@sim/battle.ts';
import type { ArmyPiece, BattleEvent } from '@sim/battle.ts';
import { parseSquare } from '@sim/board.ts';
import { BATTLE } from '@sim/data.ts';
import { createRng } from '@sim/rng.ts';
import type { PieceType } from '@sim/types.ts';
import {
  advancePlayback,
  createPlayback,
  END_HOLD_TICKS,
  frameAt,
  playbackDone,
  setSpeed,
  skipPlayback,
  snapshotUnits,
} from '../src/ui/animation.ts';
import type { UnitSnapshot } from '../src/ui/animation.ts';

const SEED = 11;
const MID = 0.5;
const HP = 100;

function unit(id: number, type: PieceType, side: 0 | 1, square: string): UnitSnapshot {
  const pos = parseSquare(square);
  return { id, type, side, stars: 1, x: pos.x, y: pos.y, maxHp: HP };
}

const from = parseSquare('c3');
const to = parseSquare('e4');

describe('frameAt', () => {
  const snapshot = [unit(0, 'N', 0, 'c3'), unit(1, 'R', 0, 'a1'), unit(2, 'P', 1, 'p8')];

  it('interpolates a move between its squares over its tick', () => {
    const moveEvent: BattleEvent = { kind: 'move', tick: 1, unit: 0, from, to };
    const before = frameAt(snapshot, [moveEvent], 0, false).pieces[0];
    const mid = frameAt(snapshot, [moveEvent], MID, false).pieces[0];
    const after = frameAt(snapshot, [moveEvent], 1, false).pieces[0];
    expect(before).toMatchObject({ x: from.x, y: from.y });
    expect(mid?.x).toBeGreaterThan(from.x);
    expect(mid?.x).toBeLessThan(to.x);
    expect(after).toMatchObject({ x: to.x, y: to.y, lift: 0 });
  });

  it('hops a knight but slides other pieces flat', () => {
    const knightMove: BattleEvent = { kind: 'move', tick: 1, unit: 0, from, to };
    const rookMove: BattleEvent = {
      kind: 'move',
      tick: 1,
      unit: 1,
      from: parseSquare('a1'),
      to: parseSquare('a3'),
    };
    const frame = frameAt(snapshot, [knightMove, rookMove], MID, false);
    expect(frame.pieces[0]?.lift).toBeGreaterThan(0);
    expect(frame.pieces[1]?.lift).toBe(0);
  });

  it('snaps moves and skips the hop under reduced motion', () => {
    const moveEvent: BattleEvent = { kind: 'move', tick: 1, unit: 0, from, to };
    const early = frameAt(snapshot, [moveEvent], 0.25, true).pieces[0];
    const late = frameAt(snapshot, [moveEvent], 0.75, true).pieces[0];
    expect(early).toMatchObject({ x: from.x, y: from.y, lift: 0 });
    expect(late).toMatchObject({ x: to.x, y: to.y, lift: 0 });
  });

  it('draws a strike line in the attacker color with a floating damage number', () => {
    const strike: BattleEvent = {
      kind: 'strike',
      tick: 1,
      attacker: 0,
      target: 2,
      damage: 42,
      targetHp: 58,
      via: 'strike',
    };
    const early = frameAt(snapshot, [strike], 0.25, false);
    const late = frameAt(snapshot, [strike], MID, false);
    expect(early.pieces[2]?.hp).toBe(HP);
    expect(late.pieces[2]?.hp).toBe(58);
    expect(late.effects).toContainEqual(expect.objectContaining({ kind: 'line', tone: 0 }));
    expect(late.effects).toContainEqual(
      expect.objectContaining({ kind: 'float', text: '-42', tone: 'damage' }),
    );
    expect(frameAt(snapshot, [strike], 3, false).effects).toHaveLength(0);
  });

  it('shows a heal number and never lifts hp above max', () => {
    const hurt: BattleEvent = {
      kind: 'strike',
      tick: 1,
      attacker: 2,
      target: 1,
      damage: 10,
      targetHp: HP - 10,
      via: 'strike',
    };
    const heal: BattleEvent = { kind: 'heal', tick: 2, healer: 0, target: 1, amount: 10 };
    const frame = frameAt(snapshot, [hurt, heal], 2, false);
    expect(frame.pieces[1]?.hp).toBe(HP);
    expect(frame.effects).toContainEqual(
      expect.objectContaining({ kind: 'float', text: '+10', tone: 'heal' }),
    );
  });

  it('rings and fades a dead piece, then removes it', () => {
    const death: BattleEvent = { kind: 'death', tick: 1, unit: 2, pos: parseSquare('p8') };
    const dying = frameAt(snapshot, [death], MID, false);
    expect(dying.pieces).toHaveLength(snapshot.length);
    expect(dying.pieces[2]?.alpha).toBeLessThan(1);
    expect(dying.effects).toContainEqual(expect.objectContaining({ kind: 'ring' }));
    const gone = frameAt(snapshot, [death], 2, false);
    expect(gone.pieces).toHaveLength(snapshot.length - 1);
  });
});

describe('frameAt on a real battle', () => {
  const armies: ArmyPiece[] = [
    { type: 'Q', stars: 2, pos: parseSquare('g6') },
    { type: 'N', stars: 1, pos: parseSquare('f4') },
    { type: 'B', stars: 2, pos: parseSquare('e2') },
    { type: 'R', stars: 1, pos: parseSquare('j6') },
    { type: 'P', stars: 1, pos: parseSquare('k4') },
    { type: 'N', stars: 2, pos: parseSquare('l2') },
  ];

  it('ends on the final sim positions and hp', () => {
    const battle = createBattle(armies, createRng(SEED));
    const snapshot = snapshotUnits(battle);
    while (!battle.finished) stepBattle(battle);
    const frame = frameAt(snapshot, battle.events, battle.tick + END_HOLD_TICKS, false);
    const survivors = battle.units.filter((u) => u.hp > 0);
    expect(frame.pieces).toHaveLength(survivors.length);
    expect(frame.effects).toHaveLength(0);
    for (const u of survivors) {
      expect(frame.pieces).toContainEqual(
        expect.objectContaining({ type: u.type, side: u.side, x: u.x, y: u.y, hp: u.hp }),
      );
    }
  });
});

describe('playback', () => {
  const armies: ArmyPiece[] = [
    { type: 'R', stars: 1, pos: parseSquare('a1') },
    { type: 'R', stars: 1, pos: parseSquare('p8') },
  ];

  it('steps the sim just far enough to stay ahead of the clock', () => {
    const battle = createBattle(armies, createRng(SEED));
    const playback = createPlayback();
    advancePlayback(playback, BATTLE.tickMs * 2.5, battle, () => {
      stepBattle(battle);
    });
    expect(playback.time).toBeCloseTo(2.5);
    expect(battle.tick).toBe(3);
  });

  it('runs faster at higher speeds', () => {
    const battle = createBattle(armies, createRng(SEED));
    const playback = createPlayback();
    setSpeed(playback, BATTLE.speeds[2]);
    advancePlayback(playback, BATTLE.tickMs, battle, () => {
      stepBattle(battle);
    });
    expect(playback.time).toBeCloseTo(BATTLE.speeds[2]);
  });

  it('skips to the end and reports done', () => {
    const battle = createBattle(armies, createRng(SEED));
    const playback = createPlayback();
    expect(playbackDone(playback, battle)).toBe(false);
    while (!battle.finished) stepBattle(battle);
    skipPlayback(playback, battle);
    expect(playbackDone(playback, battle)).toBe(true);
  });
});
