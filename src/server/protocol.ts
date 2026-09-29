/**
 * Wire protocol for online 1v1. Clients send intents only; the server owns all
 * state. Every inbound message is untrusted JSON, so `parseClientMessage`
 * checks its shape and returns null for anything malformed.
 */
import type { BattleEvent } from '@sim/battle.ts';
import type { Economy, IncomeBreakdown } from '@sim/economy.ts';
import type { IntentError, Phase, RoundResult } from '@sim/game.ts';
import type { Holdings, ShopState } from '@sim/shop.ts';
import type { PieceType, Side, StarLevel } from '@sim/types.ts';

/** Where a piece is being put during prep. */
export type PlaceTarget =
  | { readonly kind: 'board'; readonly x: number; readonly y: number }
  | { readonly kind: 'bench'; readonly slot: number };

/** Everything a seat may do during prep. */
export type Intent =
  | { readonly type: 'buy'; readonly slot: number }
  | { readonly type: 'sell'; readonly pieceId: number }
  | { readonly type: 'reroll' }
  | { readonly type: 'lock' }
  | { readonly type: 'buyXP' }
  | { readonly type: 'place'; readonly pieceId: number; readonly to: PlaceTarget }
  | { readonly type: 'ready' };

/**
 * `create` opens a room and returns its code; `join` takes a seat in an
 * existing room; `rejoin` reclaims a seat with the token from `joined`.
 * Before the match starts, `ready` is the lobby ready-up; once it has started
 * it is the prep-phase intent.
 */
export type ClientMessage =
  | { readonly type: 'create'; readonly name: string }
  | { readonly type: 'join'; readonly room: string; readonly name: string }
  | { readonly type: 'rejoin'; readonly room: string; readonly token: string }
  | Intent;

/** One seat as shown in the lobby. */
export interface LobbySeat {
  readonly name: string;
  readonly ready: boolean;
  readonly connected: boolean;
}

export interface FightUnit {
  readonly id: number;
  readonly type: PieceType;
  readonly stars: StarLevel;
  readonly side: Side;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
}

/** A player's own state, sent only to that player. */
export interface OwnView {
  readonly name: string;
  readonly hp: number;
  readonly econ: Economy;
  readonly holdings: Holdings;
  readonly shop: ShopState;
  readonly ready: boolean;
}

/** What the other player may see: no shop, bench or board during prep. */
export interface OpponentView {
  readonly name: string;
  readonly hp: number;
  readonly level: number;
  readonly ready: boolean;
}

export interface SeatView {
  readonly round: number;
  readonly phase: Phase;
  readonly side: Side;
  readonly you: OwnView;
  readonly opponent: OpponentView;
  readonly income: IncomeBreakdown | null;
  readonly gameWinner: Side | null;
}

export type ServerMessage =
  | {
      readonly type: 'joined';
      readonly room: string;
      readonly side: Side;
      /** Secret for `rejoin`; keep it to resume this seat after a disconnect. */
      readonly token: string;
    }
  | {
      readonly type: 'lobby';
      readonly room: string;
      /** Seat 0 then seat 1; null while a seat is still empty. */
      readonly seats: readonly [LobbySeat | null, LobbySeat | null];
    }
  /** The opponent dropped or came back. `forfeitMs` is the time left to return. */
  | { readonly type: 'presence'; readonly connected: boolean; readonly forfeitMs: number | null }
  /** The match ended early because a player did not return in time. */
  | { readonly type: 'forfeit'; readonly winner: Side }
  | { readonly type: 'state'; readonly state: SeatView }
  | {
      readonly type: 'fight';
      readonly round: number;
      /** Both armies at tick 0; event ids refer to these units. */
      readonly army: readonly FightUnit[];
      readonly events: readonly BattleEvent[];
      readonly result: RoundResult;
    }
  | { readonly type: 'error'; readonly error: ServerError };

export type ServerError =
  | IntentError
  | 'bad-message'
  | 'not-joined'
  | 'already-joined'
  | 'room-full'
  | 'no-such-room'
  | 'bad-token'
  | 'already-ready'
  | 'rejected';

const MAX_NAME_LENGTH = 20;
const MAX_ROOM_LENGTH = 32;
const MAX_TOKEN_LENGTH = 128;
const DEFAULT_NAME = 'Player';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function parsePlaceTarget(value: unknown): PlaceTarget | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'board' && isInt(value.x) && isInt(value.y)) {
    return { kind: 'board', x: value.x, y: value.y };
  }
  if (value.kind === 'bench' && isInt(value.slot)) return { kind: 'bench', slot: value.slot };
  return null;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_NAME;
  const name = value.trim().slice(0, MAX_NAME_LENGTH);
  return name === '' ? DEFAULT_NAME : name;
}

/** Parse one raw websocket message. Returns null when it is not a valid message. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.type) {
    case 'create':
      return { type: 'create', name: parseName(data.name) };
    case 'rejoin':
      if (typeof data.room !== 'string' || typeof data.token !== 'string') return null;
      if (data.room === '' || data.room.length > MAX_ROOM_LENGTH) return null;
      if (data.token === '' || data.token.length > MAX_TOKEN_LENGTH) return null;
      return { type: 'rejoin', room: data.room.toUpperCase(), token: data.token };
    case 'join':
      if (typeof data.room !== 'string') return null;
      if (data.room === '' || data.room.length > MAX_ROOM_LENGTH) return null;
      return { type: 'join', room: data.room.toUpperCase(), name: parseName(data.name) };
    case 'buy':
      return isInt(data.slot) ? { type: 'buy', slot: data.slot } : null;
    case 'sell':
      return isInt(data.pieceId) ? { type: 'sell', pieceId: data.pieceId } : null;
    case 'place': {
      const to = parsePlaceTarget(data.to);
      return isInt(data.pieceId) && to ? { type: 'place', pieceId: data.pieceId, to } : null;
    }
    case 'reroll':
    case 'lock':
    case 'buyXP':
    case 'ready':
      return { type: data.type };
    default:
      return null;
  }
}
