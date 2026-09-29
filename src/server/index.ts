/**
 * WebSocket front end for online 1v1.
 *
 * Lobby: one player creates a room and gets a short code, the other joins with
 * it, both ready up, and the authoritative `Room` takes over. Each seat has a
 * secret token, so a dropped player can rejoin and gets the current state
 * resent. A player who stays away longer than `forfeitMs` forfeits.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import type { Side } from '@sim/types.ts';
import { parseClientMessage } from './protocol.ts';
import type { LobbySeat, ServerError, ServerMessage } from './protocol.ts';
import { Room } from './room.ts';

interface Seat {
  name: string;
  token: string;
  socket: WebSocket | null;
  /** Lobby ready-up, before the match starts. */
  ready: boolean;
  forfeitTimer: ReturnType<typeof setTimeout> | null;
}

interface Lobby {
  code: string;
  seats: [Seat | null, Seat | null];
  room: Room | null;
}

interface Binding {
  code: string;
  side: Side;
}

export interface ServerOptions {
  port?: number;
  /** How long a disconnected player has to return before forfeiting. */
  forfeitMs?: number;
}

export interface GameServer {
  readonly port: number;
  close(): Promise<void>;
}

const DEFAULT_PORT = 8787;
const DEFAULT_FORFEIT_MS = 60_000;
const SEED_LIMIT = 2 ** 32;
/** No 0/O/1/I so codes are easy to read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const TOKEN_BYTES = 16;

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  return Buffer.from(data as ArrayBuffer).toString();
}

function send(socket: WebSocket | null, message: ServerMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function otherSide(side: Side): Side {
  return side === 0 ? 1 : 0;
}

function makeCode(taken: ReadonlyMap<string, unknown>): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++)
      code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
    if (!taken.has(code)) return code;
  }
}

/** Start the server. Pass port 0 to pick a free one. */
export async function startServer(options: ServerOptions = {}): Promise<GameServer> {
  const forfeitMs = options.forfeitMs ?? DEFAULT_FORFEIT_MS;
  const wss = new WebSocketServer({ port: options.port ?? DEFAULT_PORT });
  await new Promise<void>((resolve) => wss.once('listening', resolve));
  const lobbies = new Map<string, Lobby>();
  const bindings = new WeakMap<WebSocket, Binding>();

  const lobbySeat = (seat: Seat | null): LobbySeat | null =>
    seat ? { name: seat.name, ready: seat.ready, connected: seat.socket !== null } : null;

  const sendLobby = (lobby: Lobby, socket?: WebSocket | null): void => {
    const message: ServerMessage = {
      type: 'lobby',
      room: lobby.code,
      seats: [lobbySeat(lobby.seats[0]), lobbySeat(lobby.seats[1])],
    };
    if (socket) send(socket, message);
    else for (const seat of lobby.seats) send(seat?.socket ?? null, message);
  };

  const sendState = (lobby: Lobby, side: Side): void => {
    if (lobby.room)
      send(lobby.seats[side]?.socket ?? null, { type: 'state', state: lobby.room.view(side) });
  };

  const broadcastState = (lobby: Lobby): void => {
    sendState(lobby, 0);
    sendState(lobby, 1);
  };

  const closeLobby = (lobby: Lobby): void => {
    for (const seat of lobby.seats) if (seat?.forfeitTimer) clearTimeout(seat.forfeitTimer);
    lobbies.delete(lobby.code);
  };

  const fail = (socket: WebSocket, error: ServerError): void => {
    send(socket, { type: 'error', error });
  };

  const seatSocket = (lobby: Lobby, socket: WebSocket, side: Side, seat: Seat): void => {
    seat.socket = socket;
    lobby.seats[side] = seat;
    bindings.set(socket, { code: lobby.code, side });
    send(socket, { type: 'joined', room: lobby.code, side, token: seat.token });
  };

  const newSeat = (name: string): Seat => ({
    name,
    token: randomBytes(TOKEN_BYTES).toString('hex'),
    socket: null,
    ready: false,
    forfeitTimer: null,
  });

  const create = (socket: WebSocket, name: string): void => {
    if (bindings.has(socket)) {
      fail(socket, 'already-joined');
      return;
    }
    const lobby: Lobby = { code: makeCode(lobbies), seats: [null, null], room: null };
    lobbies.set(lobby.code, lobby);
    seatSocket(lobby, socket, 0, newSeat(name));
    sendLobby(lobby);
  };

  const join = (socket: WebSocket, code: string, name: string): void => {
    if (bindings.has(socket)) {
      fail(socket, 'already-joined');
      return;
    }
    const lobby = lobbies.get(code);
    if (!lobby) {
      fail(socket, 'no-such-room');
      return;
    }
    const side: Side | null = lobby.seats[0] === null ? 0 : lobby.seats[1] === null ? 1 : null;
    if (side === null) {
      fail(socket, 'room-full');
      return;
    }
    seatSocket(lobby, socket, side, newSeat(name));
    sendLobby(lobby);
  };

  const rejoin = (socket: WebSocket, code: string, token: string): void => {
    if (bindings.has(socket)) {
      fail(socket, 'already-joined');
      return;
    }
    const lobby = lobbies.get(code);
    if (!lobby) {
      fail(socket, 'no-such-room');
      return;
    }
    const side = lobby.seats.findIndex((s) => s?.token === token);
    const seat = side === 0 || side === 1 ? lobby.seats[side] : null;
    if (!seat || (side !== 0 && side !== 1)) {
      fail(socket, 'bad-token');
      return;
    }
    // A stale connection still holding the seat is replaced.
    const old = seat.socket;
    seat.socket = null;
    if (old) {
      bindings.delete(old);
      old.close();
    }
    if (seat.forfeitTimer) clearTimeout(seat.forfeitTimer);
    seat.forfeitTimer = null;
    seatSocket(lobby, socket, side, seat);
    send(lobby.seats[otherSide(side)]?.socket ?? null, {
      type: 'presence',
      connected: true,
      forfeitMs: null,
    });
    if (lobby.room) sendState(lobby, side);
    else sendLobby(lobby);
  };

  /** Lobby ready-up; the match starts once both seats are ready. */
  const lobbyReady = (lobby: Lobby, side: Side): void => {
    const seat = lobby.seats[side];
    if (!seat) return;
    seat.ready = true;
    const [a, b] = lobby.seats;
    if (a?.ready && b?.ready) {
      lobby.room = new Room(randomInt(SEED_LIMIT), [a.name, b.name]);
      broadcastState(lobby);
    } else {
      sendLobby(lobby);
    }
  };

  const onDisconnect = (socket: WebSocket): void => {
    const binding = bindings.get(socket);
    const lobby = binding ? lobbies.get(binding.code) : undefined;
    const seat = lobby && binding ? lobby.seats[binding.side] : null;
    if (!binding || !lobby || seat?.socket !== socket) return;
    seat.socket = null;
    const opponent = lobby.seats[otherSide(binding.side)];
    if (!opponent?.socket && !lobby.room) {
      // Nobody left in a lobby that never started.
      closeLobby(lobby);
      return;
    }
    send(opponent?.socket ?? null, { type: 'presence', connected: false, forfeitMs });
    sendLobby(lobby);
    seat.forfeitTimer = setTimeout(() => {
      seat.forfeitTimer = null;
      if (lobbies.get(lobby.code) !== lobby) return;
      const finished = lobby.room?.game.phase === 'over';
      if (lobby.room && !finished) {
        const winner = otherSide(binding.side);
        for (const s of lobby.seats) send(s?.socket ?? null, { type: 'forfeit', winner });
      }
      closeLobby(lobby);
    }, forfeitMs);
  };

  wss.on('connection', (socket) => {
    socket.on('message', (data: RawData) => {
      const message = parseClientMessage(rawToString(data));
      if (!message) {
        fail(socket, 'bad-message');
        return;
      }
      switch (message.type) {
        case 'create':
          create(socket, message.name);
          return;
        case 'join':
          join(socket, message.room, message.name);
          return;
        case 'rejoin':
          rejoin(socket, message.room, message.token);
          return;
        default:
      }
      const binding = bindings.get(socket);
      const lobby = binding ? lobbies.get(binding.code) : undefined;
      if (!binding || !lobby) {
        fail(socket, 'not-joined');
        return;
      }
      if (!lobby.room) {
        if (message.type === 'ready') lobbyReady(lobby, binding.side);
        else fail(socket, 'wrong-phase');
        return;
      }
      const outcome = lobby.room.handle(binding.side, message);
      if (!outcome.ok) {
        fail(socket, outcome.error);
        return;
      }
      if (outcome.fight) {
        for (const s of lobby.seats) send(s?.socket ?? null, { type: 'fight', ...outcome.fight });
      }
      broadcastState(lobby);
    });
    socket.on('close', () => {
      onDisconnect(socket);
    });
  });

  const address = wss.address();
  return {
    port:
      address !== null && typeof address === 'object'
        ? address.port
        : (options.port ?? DEFAULT_PORT),
    close: () =>
      new Promise<void>((resolve) => {
        for (const lobby of lobbies.values()) closeLobby(lobby);
        for (const client of wss.clients) client.terminate();
        wss.close(() => {
          resolve();
        });
      }),
  };
}
