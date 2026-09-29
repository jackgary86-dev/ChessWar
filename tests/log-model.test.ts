import { describe, expect, it } from 'vitest';

import { createBattle, stepBattle } from '@sim/battle.ts';
import type { ArmyPiece, BattleEvent } from '@sim/battle.ts';
import { parseSquare } from '@sim/board.ts';
import { PIECES, PIECE_ORDER, unitAtk, unitHp } from '@sim/data.ts';
import { createRng } from '@sim/rng.ts';
import type { Holdings } from '@sim/shop.ts';
import type { PieceType, StarLevel } from '@sim/types.ts';
import type { UnitSnapshot } from '../src/ui/animation.ts';
import { snapshotUnits } from '../src/ui/animation.ts';
import { battleLog, detectMerges, fieldManual } from '../src/ui/log-model.ts';

const HP = 100;

function unit(id: number, type: PieceType, side: 0 | 1, square: string): UnitSnapshot {
  const pos = parseSquare(square);
  return { id, type, side, stars: 1, x: pos.x, y: pos.y, maxHp: HP };
}

function holdings(pieces: readonly [PieceType, StarLevel][]): Holdings {
  return {
    bench: pieces.map(([type, stars], i) => ({ id: i, type, stars })),
    board: [],
    nextId: pieces.length,
  };
}

describe('battleLog', () => {
  const snapshot = [unit(0, 'N', 0, 'c3'), unit(1, 'B', 1, 'e4')];

  it('logs a kill as attacker glyph, from×to, and the victim', () => {
    const events: BattleEvent[] = [
      {
        kind: 'strike',
        tick: 3,
        attacker: 0,
        target: 1,
        damage: HP,
        targetHp: 0,
        via: 'strike',
      },
      { kind: 'death', tick: 3, unit: 1, pos: parseSquare('e4') },
    ];
    expect(battleLog(snapshot, events)).toEqual([
      { text: `${PIECES.N.glyph} c3×e4 Bishop falls`, tone: 'kill', tick: 3, side: 0 },
    ]);
  });

  it('uses the attacker’s square after it has moved', () => {
    const events: BattleEvent[] = [
      { kind: 'move', tick: 1, unit: 0, from: parseSquare('c3'), to: parseSquare('d5') },
      { kind: 'strike', tick: 2, attacker: 0, target: 1, damage: HP, targetHp: 0, via: 'strike' },
      { kind: 'death', tick: 2, unit: 1, pos: parseSquare('e4') },
    ];
    expect(battleLog(snapshot, events)[0]?.text).toContain('d5×e4');
  });

  it('logs portal crossings', () => {
    const events: BattleEvent[] = [
      { kind: 'portal', tick: 4, unit: 0, from: parseSquare('h6'), to: parseSquare('i6') },
    ];
    expect(battleLog(snapshot, events)).toEqual([
      { text: `${PIECES.N.glyph} h6→i6 crosses the wall`, tone: 'portal', tick: 4, side: 0 },
    ]);
  });

  it('produces one kill line per death in a real battle', () => {
    const armies: ArmyPiece[] = [
      { type: 'Q', stars: 3, pos: parseSquare('g6') },
      { type: 'N', stars: 1, pos: parseSquare('j5') },
      { type: 'P', stars: 1, pos: parseSquare('k4') },
    ];
    const battle = createBattle(armies, createRng(2));
    const snap = snapshotUnits(battle);
    while (!battle.finished) stepBattle(battle);
    const deaths = battle.events.filter((e) => e.kind === 'death').length;
    const kills = battleLog(snap, battle.events).filter((l) => l.tone === 'kill');
    expect(kills).toHaveLength(deaths);
    for (const line of kills) expect(line.text).toMatch(/×.* falls$/);
  });
});

describe('detectMerges', () => {
  it('reports a merge when a star count rises', () => {
    const before = holdings([
      ['P', 1],
      ['P', 1],
    ]);
    const after = holdings([['P', 2]]);
    expect(detectMerges(before, after)).toMatchObject([
      { text: `${PIECES.P.glyph} Pawn merges to 2★`, tone: 'merge' },
    ]);
  });

  it('reports nothing for an ordinary buy', () => {
    expect(
      detectMerges(
        holdings([['P', 1]]),
        holdings([
          ['P', 1],
          ['N', 1],
        ]),
      ),
    ).toEqual([]);
  });

  it('reports a chained merge to 3★', () => {
    const before = holdings([
      ['R', 2],
      ['R', 2],
      ['R', 1],
      ['R', 1],
    ]);
    const after = holdings([['R', 3]]);
    expect(detectMerges(before, after).map((l) => l.text)).toEqual([
      `${PIECES.R.glyph} Rook merges to 3★`,
    ]);
  });
});

describe('fieldManual', () => {
  const manual = fieldManual();

  it('lists every piece in shop order with data.ts stats', () => {
    expect(manual.map((e) => e.type)).toEqual([...PIECE_ORDER]);
    for (const entry of manual) {
      const def = PIECES[entry.type];
      expect(entry.cost).toBe(def.cost);
      expect(entry.hp).toBe(
        `${String(unitHp(entry.type, 1))} / ${String(unitHp(entry.type, 2))} / ${String(unitHp(entry.type, 3))}`,
      );
      expect(entry.atk.startsWith(String(unitAtk(entry.type, 1)))).toBe(true);
      expect(entry.movement).toBe(def.movement);
      expect(entry.strike).toBe(def.strike);
    }
  });

  it('spells out ability numbers per star', () => {
    const by = (t: PieceType): string => manual.find((e) => e.type === t)?.ability ?? '';
    expect(by('P')).toContain('2★ 15%, 3★ 30%');
    expect(by('N')).toContain('2★ 1 extra, 3★ all');
    expect(by('B')).toContain('2★ 60%, 3★ 120%');
    expect(by('R')).toContain('2★ 20%, 3★ 35%');
    expect(by('Q')).toContain('2★ 50%, 3★ 100%');
  });
});
