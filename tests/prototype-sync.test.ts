/**
 * The single-file prototype (prototype/chess-war.html) must keep the same rules
 * numbers as src/sim/data.ts until the production build replaces it. This reads
 * the prototype's DATA block and compares it with the sim's balance data.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  BATTLE,
  BOARD,
  PIECE_ORDER,
  PIECES,
  PLAYER,
  POOL_SIZE,
  SLIDER_STRIKE_RANGE,
  STAR_ATK_MULT,
  STAR_HP_MULT,
  TIER_ODDS,
  XP_TO_NEXT_LEVEL,
} from '@sim/data.ts';

const html = readFileSync(new URL('../prototype/chess-war.html', import.meta.url), 'utf8');

/** Evaluate the prototype's constant declarations and return the named ones. */
function prototypeConstants(names: string[]): Record<string, unknown> {
  const start = html.indexOf('/* ============ DATA ============ */');
  const end = html.indexOf('const FILES');
  const lines = html.slice(start, end);
  const geometry = html.slice(html.indexOf('const W = 16'), html.indexOf('const idx'));
  const strike = /const STRIKE_RANGE = \d+;/.exec(html)?.[0] ?? '';
  const portals = /const PORTAL_Y = \[[^\]]*\];/.exec(html)?.[0] ?? '';
  const body = `${lines}\n${geometry}\n${portals}\n${strike}\nreturn { ${names.join(', ')} };`;
  return runInNewContext(`(() => {\n${body}\n})()`) as Record<string, unknown>;
}

interface ProtoPiece {
  cost: number;
  tier: number;
  hp: number;
  atk: number;
  spd: number;
}

const proto = prototypeConstants([
  'TYPES',
  'ORDER',
  'POOL_SIZE',
  'ODDS',
  'XPNEED',
  'STAR_HP',
  'STAR_ATK',
  'START_HP',
  'MAX_LEVEL',
  'TICK_MS',
  'MAX_TICKS',
  'IDLE_LIMIT',
  'W',
  'H',
  'PORTAL_Y',
  'STRIKE_RANGE',
]);

describe('prototype rules match src/sim/data.ts', () => {
  it('states a rules version at the top of the file', () => {
    expect(html.slice(0, 600)).toMatch(/Rules version: \d+\.\d+/);
    expect(html).toMatch(/data-rules-version="\d+\.\d+"/);
  });

  it('has the same pieces and stats', () => {
    expect(proto.ORDER).toEqual([...PIECE_ORDER]);
    const types = proto.TYPES as Record<string, ProtoPiece>;
    for (const type of PIECE_ORDER) {
      const def = PIECES[type];
      const p = types[type];
      expect(p, type).toMatchObject({
        cost: def.cost,
        tier: def.tier,
        hp: def.hp,
        atk: def.atk,
        spd: def.speed,
      });
    }
  });

  it('has the same pool, shop odds, xp and star multipliers', () => {
    expect(proto.POOL_SIZE).toEqual(POOL_SIZE);
    expect(proto.XPNEED).toEqual(XP_TO_NEXT_LEVEL);
    const odds = proto.ODDS as Record<string, number[]>;
    for (const [level, row] of Object.entries(TIER_ODDS)) expect(odds[level], level).toEqual(row);
    expect(proto.STAR_HP).toEqual([0, STAR_HP_MULT[1], STAR_HP_MULT[2], STAR_HP_MULT[3]]);
    expect(proto.STAR_ATK).toEqual([0, STAR_ATK_MULT[1], STAR_ATK_MULT[2], STAR_ATK_MULT[3]]);
  });

  it('has the same board, fight and player numbers', () => {
    expect(proto.W).toBe(BOARD.width);
    expect(proto.H).toBe(BOARD.height);
    expect(proto.PORTAL_Y).toEqual([...new Set(BOARD.portals.map((p) => p.y))]);
    expect(proto.START_HP).toBe(PLAYER.startHp);
    expect(proto.MAX_LEVEL).toBe(PLAYER.maxLevel);
    expect(proto.TICK_MS).toBe(BATTLE.tickMs);
    expect(proto.MAX_TICKS).toBe(BATTLE.maxTicks);
    expect(proto.IDLE_LIMIT).toBe(BATTLE.idleTickLimit);
    expect(proto.STRIKE_RANGE).toBe(SLIDER_STRIKE_RANGE);
  });
});
