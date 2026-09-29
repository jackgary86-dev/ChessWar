/**
 * Client-side model of an online match: a reducer over server messages, plus
 * pure helpers that turn what the server sends into the shapes the existing
 * HUD, overlays and animation already understand.
 *
 * The server never sends the opponent's shop, bench or board during prep, and
 * never sends a live battle: the fight arrives as a finished event list.
 */
import type { BattleState } from '@sim/battle.ts';
import { unitAtk, unitHp } from '@sim/data.ts';
import { createEconomy } from '@sim/economy.ts';
import type { GameState, RoundResult } from '@sim/game.ts';
import { createRng } from '@sim/rng.ts';
import { createHoldings, createPool, createShop } from '@sim/shop.ts';
import type { Side } from '@sim/types.ts';
import type { LobbySeat, SeatView, ServerError, ServerMessage } from '../server/protocol.ts';
import type { NetStatus } from './net.ts';

type FightMessage = Extract<ServerMessage, { type: 'fight' }>;

export interface OnlineState {
  status: NetStatus;
  room: string | null;
  side: Side | null;
  /** Seat 0 then seat 1, while in the lobby. */
  lobby: readonly [LobbySeat | null, LobbySeat | null] | null;
  /** Latest state the server sent. */
  view: SeatView | null;
  /** A fight the player has not yet watched. */
  fight: FightMessage | null;
  /** The opponent dropped; ms they have to come back. Null while they are here. */
  opponentAwayMs: number | null;
  /** Set when the match ended because someone did not return. */
  forfeitWinner: Side | null;
  error: ServerError | null;
}

export function initialOnlineState(status: NetStatus = 'connecting'): OnlineState {
  return {
    status,
    room: null,
    side: null,
    lobby: null,
    view: null,
    fight: null,
    opponentAwayMs: null,
    forfeitWinner: null,
    error: null,
  };
}

export type OnlineEvent = ServerMessage | { readonly type: 'status'; readonly status: NetStatus };

export function onlineReduce(state: OnlineState, event: OnlineEvent): OnlineState {
  switch (event.type) {
    case 'status':
      return { ...state, status: event.status };
    case 'joined':
      return { ...state, room: event.room, side: event.side, error: null };
    case 'lobby':
      return { ...state, lobby: event.seats, error: null };
    case 'state':
      return { ...state, view: event.state, error: null };
    case 'fight':
      return { ...state, fight: event };
    case 'presence':
      return { ...state, opponentAwayMs: event.connected ? null : event.forfeitMs };
    case 'forfeit':
      return { ...state, forfeitWinner: event.winner };
    case 'error':
      return { ...state, error: event.error };
  }
}

const ERROR_TEXT: Partial<Record<ServerError, string>> = {
  'no-such-room': 'No room with that code.',
  'room-full': 'That room is full.',
  'bad-token': 'Your seat is no longer available.',
  rejected: 'The server did not allow that.',
};

export function errorText(error: ServerError): string {
  return ERROR_TEXT[error] ?? 'Something went wrong. Try again.';
}

/**
 * A `GameState` for the HUD to draw: the player's own state in full and only
 * the public facts (name, HP, level) about the opponent, who is marked as
 * `isAI` so the HUD keeps their gold and board hidden. While waiting for the
 * opponent the phase reads 'combat', which disables the action buttons.
 */
export function mirrorGame(view: SeatView): GameState {
  const me = view.side;
  const them: Side = me === 0 ? 1 : 0;
  const players: GameState['players'] = [
    {
      name: '',
      hp: 0,
      econ: createEconomy(),
      holdings: createHoldings(),
      shop: createShop(),
      isAI: true,
    },
    {
      name: '',
      hp: 0,
      econ: createEconomy(),
      holdings: createHoldings(),
      shop: createShop(),
      isAI: true,
    },
  ];
  players[me] = {
    name: view.you.name,
    hp: view.you.hp,
    econ: view.you.econ,
    holdings: view.you.holdings,
    shop: view.you.shop,
    isAI: false,
  };
  players[them] = {
    name: view.opponent.name,
    hp: view.opponent.hp,
    econ: {
      ...createEconomy(),
      level: view.opponent.level as GameState['players'][0]['econ']['level'],
    },
    holdings: createHoldings(),
    shop: createShop(),
    isAI: true,
  };
  const phase = view.phase === 'prep' && view.you.ready ? 'combat' : view.phase;
  return {
    mode: 'ai',
    round: view.round,
    phase,
    active: me,
    players,
    pool: createPool(),
    rng: createRng(0),
    battle: null,
    result: null,
    gameWinner: view.gameWinner,
    income: null,
  };
}

/**
 * A finished `BattleState` for the animation to play. The event ids refer to
 * the tick-0 army in the message; the sim is never stepped on the client.
 */
export function battleFromFight(fight: FightMessage): BattleState {
  const lastTick = fight.events.reduce((max, e) => Math.max(max, e.tick), 0);
  return {
    tick: lastTick,
    units: fight.army.map((u) => ({
      id: u.id,
      type: u.type,
      stars: u.stars,
      side: u.side,
      x: u.x,
      y: u.y,
      hp: u.hp,
      maxHp: unitHp(u.type, u.stars),
      atk: unitAtk(u.type, u.stars),
      cooldown: 0,
    })),
    rng: createRng(0),
    events: [...fight.events],
    winner: fight.result.winner,
    finished: true,
    endReason: fight.result.byMaterial ? 'timeout' : 'elimination',
    lastDamageTick: lastTick,
  };
}

/** The mirror while the round result is on screen: the fight's own result, names from the last view. */
export function withResult(game: GameState, result: RoundResult): GameState {
  return { ...game, phase: 'result', result, round: result.round };
}

export type OnlineOverlay =
  | { readonly kind: 'online-menu'; readonly error: string | null }
  | {
      readonly kind: 'online-lobby';
      readonly room: string;
      readonly seats: readonly [LobbySeat | null, LobbySeat | null];
      readonly youReady: boolean;
    }
  | {
      readonly kind: 'online-status';
      readonly title: string;
      readonly subtitle: string;
      readonly button: string;
    };

/**
 * The online overlay to show before the match starts or when the connection
 * needs the player's attention; null when the board is in play.
 */
export function onlineOverlay(state: OnlineState | null): OnlineOverlay | null {
  if (!state) return null;
  if (state.forfeitWinner !== null) {
    const won = state.forfeitWinner === state.side;
    return {
      kind: 'online-status',
      title: won ? 'You win' : 'You forfeited',
      subtitle: won ? 'Your opponent did not come back in time.' : 'You were away for too long.',
      button: 'Back to menu',
    };
  }
  if (state.status === 'closed') {
    return {
      kind: 'online-status',
      title: 'Disconnected',
      subtitle: 'The connection to the server was lost.',
      button: 'Back to menu',
    };
  }
  if (state.status === 'connecting' || state.status === 'reconnecting') {
    return {
      kind: 'online-status',
      title: state.status === 'connecting' ? 'Connecting…' : 'Reconnecting…',
      subtitle: 'Trying to reach the server.',
      button: 'Cancel',
    };
  }
  if (state.room === null || state.side === null) {
    return { kind: 'online-menu', error: state.error ? errorText(state.error) : null };
  }
  if (state.view === null) {
    const seats = state.lobby ?? [null, null];
    const mine = seats[state.side];
    return {
      kind: 'online-lobby',
      room: state.room,
      seats,
      youReady: mine?.ready ?? false,
    };
  }
  return null;
}

/** One line under the board about the opponent and the connection, or null. */
export function connectionNote(state: OnlineState): string | null {
  if (state.status === 'reconnecting') return 'Connection lost. Reconnecting…';
  if (state.opponentAwayMs !== null) {
    const seconds = Math.ceil(state.opponentAwayMs / 1000);
    return `Opponent disconnected. They forfeit in ${String(seconds)} s if they do not return.`;
  }
  if (state.view?.you.ready && state.view.phase === 'prep') return 'Waiting for your opponent…';
  return null;
}
