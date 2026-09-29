/**
 * Battle log lines in chess notation, and the field manual, both derived from
 * simulation data. Pure functions: no DOM, so they are unit-testable.
 */
import { squareName } from '@sim/board.ts';
import type { BattleEvent } from '@sim/battle.ts';
import type { Pos } from '@sim/board.ts';
import { ABILITY, PIECES, PIECE_ORDER, unitAtk, unitHp } from '@sim/data.ts';
import type { GameState } from '@sim/game.ts';
import type { Holdings } from '@sim/shop.ts';
import type { PieceType, Side, StarLevel, Tier } from '@sim/types.ts';
import type { UnitSnapshot } from './animation.ts';

export type LogTone = 'kill' | 'portal' | 'merge' | 'result';

export interface LogLine {
  readonly text: string;
  readonly tone: LogTone;
  /** Tick the line belongs to; 0 for lines outside a fight. */
  readonly tick: number;
  readonly side?: Side;
}

const NO_TICK = 0;
const PERCENT = 100;
const STARS_TWO = 2 satisfies StarLevel;
const STARS_THREE = 3 satisfies StarLevel;

function glyphOf(type: PieceType): string {
  return PIECES[type].glyph;
}

/**
 * Log lines for a fight's kills and portal crossings, e.g.
 * `♞ c3×e4 Bishop falls`. The attacker's square is where it stood when it
 * struck; the victim's square is where it fell.
 */
export function battleLog(
  snapshot: readonly UnitSnapshot[],
  events: readonly BattleEvent[],
): LogLine[] {
  const units = new Map(snapshot.map((u) => [u.id, u]));
  const at = new Map<number, Pos>(snapshot.map((u) => [u.id, { x: u.x, y: u.y }]));
  const lastStrike = new Map<number, { attacker: number; from: Pos }>();
  const lines: LogLine[] = [];

  for (const event of events) {
    switch (event.kind) {
      case 'move':
        at.set(event.unit, event.to);
        break;
      case 'portal': {
        at.set(event.unit, event.to);
        const unit = units.get(event.unit);
        if (unit) {
          lines.push({
            text: `${glyphOf(unit.type)} ${squareName(event.from)}→${squareName(event.to)} crosses the wall`,
            tone: 'portal',
            tick: event.tick,
            side: unit.side,
          });
        }
        break;
      }
      case 'strike': {
        const from = at.get(event.attacker);
        if (from) lastStrike.set(event.target, { attacker: event.attacker, from });
        break;
      }
      case 'death': {
        const victim = units.get(event.unit);
        const killer = lastStrike.get(event.unit);
        const attacker = killer ? units.get(killer.attacker) : undefined;
        if (victim && attacker && killer) {
          lines.push({
            text: `${glyphOf(attacker.type)} ${squareName(killer.from)}×${squareName(event.pos)} ${PIECES[victim.type].name} falls`,
            tone: 'kill',
            tick: event.tick,
            side: attacker.side,
          });
        }
        break;
      }
      case 'heal':
        break;
    }
  }
  return lines;
}

/** Merges that happened between two snapshots of a player's holdings. */
export function detectMerges(before: Holdings, after: Holdings): LogLine[] {
  const count = (h: Holdings, type: PieceType, stars: StarLevel): number =>
    [...h.board, ...h.bench].filter((p) => p?.type === type && p.stars === stars).length;
  const lines: LogLine[] = [];
  for (const type of PIECE_ORDER) {
    for (const stars of [STARS_TWO, STARS_THREE] as const) {
      if (count(after, type, stars) > count(before, type, stars)) {
        lines.push({
          text: `${glyphOf(type)} ${PIECES[type].name} merges to ${String(stars)}★`,
          tone: 'merge',
          tick: NO_TICK,
        });
      }
    }
  }
  return lines;
}

/** The round result as a log line, or null if there is none yet. */
export function resultLogLine(game: GameState): LogLine | null {
  const { result } = game;
  if (!result) return null;
  const round = `Round ${String(result.round)}`;
  const text =
    result.winner === null
      ? `${round}: draw, both lose ${String(result.damage[0])} HP`
      : `${round}: ${game.players[result.winner].name} wins${result.byMaterial ? ' on material' : ''}, ${game.players[result.winner === 0 ? 1 : 0].name} loses ${String(result.damage[result.winner === 0 ? 1 : 0])} HP`;
  return { text, tone: 'result', tick: NO_TICK };
}

// ---------------------------------------------------------------------------
// Field manual
// ---------------------------------------------------------------------------

export interface ManualEntry {
  readonly type: PieceType;
  readonly name: string;
  readonly glyph: string;
  readonly cost: number;
  readonly tier: Tier;
  /** "380 / 722 / 1330" for 1★ / 2★ / 3★. */
  readonly hp: string;
  readonly atk: string;
  readonly speed: string;
  readonly movement: string;
  readonly strike: string;
  readonly ability: string;
}

function pct(ratio: number): string {
  return `${String(Math.round(ratio * PERCENT))}%`;
}

function starTriple(fn: (stars: StarLevel) => number): string {
  return [1, STARS_TWO, STARS_THREE].map((s) => String(fn(s as StarLevel))).join(' / ');
}

/** The star-2 and star-3 values of a piece's ability, as display strings. */
function abilityValues(type: PieceType): [string, string] {
  const two = STARS_TWO;
  const three = STARS_THREE;
  switch (type) {
    case 'P':
      return [pct(ABILITY.shieldWallReduction[two]), pct(ABILITY.shieldWallReduction[three])];
    case 'N':
      return [
        `${String(ABILITY.forkExtraTargets[two])} extra`,
        Number.isFinite(ABILITY.forkExtraTargets[three])
          ? `${String(ABILITY.forkExtraTargets[three])} extra`
          : 'all',
      ];
    case 'B':
      return [pct(ABILITY.blessingHealRatio[two]), pct(ABILITY.blessingHealRatio[three])];
    case 'R':
      return [pct(ABILITY.fortressReduction[two]), pct(ABILITY.fortressReduction[three])];
    case 'Q':
      return [pct(ABILITY.pierceRatio[two]), pct(ABILITY.pierceRatio[three])];
  }
}

/** One entry per piece, generated from `data.ts`. */
export function fieldManual(): ManualEntry[] {
  return PIECE_ORDER.map((type) => {
    const def = PIECES[type];
    const [two, three] = abilityValues(type);
    return {
      type,
      name: def.name,
      glyph: def.glyph,
      cost: def.cost,
      tier: def.tier,
      hp: starTriple((s) => unitHp(type, s)),
      atk: starTriple((s) => unitAtk(type, s)),
      speed: `acts every ${String(def.speed)} ticks`,
      movement: def.movement,
      strike: def.strike,
      ability: `${def.ability.name}: ${def.ability.description} 2★ ${two}, 3★ ${three}.`,
    };
  });
}
