/**
 * One online match. Transport-agnostic: the websocket layer feeds it parsed
 * intents and forwards what it returns, so the whole thing is unit-testable.
 *
 * The room runs the shared `src/sim` code unchanged. Both players prep at the
 * same time; the sim's "active side" is set to the sender before each intent so
 * the sim's own phase and ownership checks stay in force. The fight starts
 * when both seats are ready, and the server plays it to the end.
 */
import {
  buyCard,
  buyXpIntent,
  createGame,
  lockShop,
  moveToBenchSlot,
  nextRound,
  placePiece,
  ready,
  rerollShop,
  sellPiece,
  skipCombat,
} from '@sim/game.ts';
import type { GameState, RoundResult } from '@sim/game.ts';
import type { BattleEvent } from '@sim/battle.ts';
import type { Side } from '@sim/types.ts';
import type { FightUnit, Intent, SeatView, ServerError } from './protocol.ts';

export type IntentOutcome =
  | { readonly ok: true; readonly fight: FightReport | null }
  | { readonly ok: false; readonly error: ServerError };

export interface FightReport {
  readonly round: number;
  readonly army: readonly FightUnit[];
  readonly events: readonly BattleEvent[];
  readonly result: RoundResult;
}

const SIDES: readonly Side[] = [0, 1];

function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

export class Room {
  readonly game: GameState;
  private readonly readySeats: [boolean, boolean] = [false, false];

  constructor(seed: number, names: [string, string] = ['Player 1', 'Player 2']) {
    this.game = createGame({ mode: 'ai', seed, names });
    // Both seats are humans; 'ai' mode is only used for its simultaneous prep phase.
    for (const player of this.game.players) player.isAI = false;
  }

  /** Apply one client intent for `side`. Never trusts anything but the intent. */
  handle(side: Side, intent: Intent): IntentOutcome {
    const game = this.game;
    if (game.phase !== 'prep') return { ok: false, error: 'wrong-phase' };
    if (this.readySeats[side]) return { ok: false, error: 'already-ready' };
    game.active = side;

    if (intent.type === 'ready') {
      this.readySeats[side] = true;
      return { ok: true, fight: this.readySeats.every(Boolean) ? this.runFight() : null };
    }
    const result = this.apply(side, intent);
    return result === null ? { ok: true, fight: null } : { ok: false, error: result };
  }

  /** Returns an error, or null when the intent took effect. */
  private apply(side: Side, intent: Exclude<Intent, { type: 'ready' }>): ServerError | null {
    const game = this.game;
    switch (intent.type) {
      case 'buy': {
        const r = buyCard(game, side, intent.slot);
        return r === 'ok'
          ? null
          : r === 'gold' || r === 'bench-full' || r === 'empty-slot'
            ? 'rejected'
            : r;
      }
      case 'sell': {
        const r = sellPiece(game, side, intent.pieceId);
        return typeof r === 'number' ? null : r;
      }
      case 'reroll': {
        const r = rerollShop(game, side);
        return r === true ? null : r === false ? 'rejected' : r;
      }
      case 'lock':
        return lockShop(game, side);
      case 'buyXP': {
        const r = buyXpIntent(game, side);
        return r === true ? null : r === false ? 'rejected' : r;
      }
      case 'place': {
        const r =
          intent.to.kind === 'board'
            ? placePiece(game, side, intent.pieceId, intent.to.x, intent.to.y)
            : moveToBenchSlot(game, side, intent.pieceId, intent.to.slot);
        return r === 'ok' ? null : r === 'board-full' ? 'rejected' : r;
      }
    }
  }

  /** Both seats are ready: play the fight, then move on to the next round. */
  private runFight(): FightReport {
    const game = this.game;
    ready(game);
    const battle = game.battle;
    if (!battle) throw new Error('Fight did not start');
    const army: FightUnit[] = battle.units.map((u) => ({
      id: u.id,
      type: u.type,
      stars: u.stars,
      side: u.side,
      x: u.x,
      y: u.y,
      hp: u.hp,
    }));
    skipCombat(game);
    const result = game.result;
    if (!result) throw new Error('Fight did not finish');
    const report: FightReport = {
      round: game.round,
      army,
      events: [...battle.events],
      result,
    };
    nextRound(game);
    this.readySeats[0] = false;
    this.readySeats[1] = false;
    return report;
  }

  /** What `side` is allowed to see. The opponent's shop, bench and board stay hidden. */
  view(side: Side): SeatView {
    const game = this.game;
    const me = game.players[side];
    const them = game.players[other(side)];
    return {
      round: game.round,
      phase: game.phase,
      side,
      you: {
        name: me.name,
        hp: me.hp,
        econ: structuredClone(me.econ),
        holdings: structuredClone(me.holdings),
        shop: structuredClone(me.shop),
        ready: this.readySeats[side],
      },
      opponent: {
        name: them.name,
        hp: them.hp,
        level: them.econ.level,
        ready: this.readySeats[other(side)],
      },
      income: game.income ? structuredClone(game.income[side]) : null,
      gameWinner: game.gameWinner,
    };
  }

  get seats(): readonly Side[] {
    return SIDES;
  }
}
