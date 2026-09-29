/**
 * WebSocket front end for online 1v1: joins two sockets to a room by name and
 * relays intents to the authoritative `Room`. Room codes and reconnecting
 * arrive with the lobby ticket; for now a dropped player ends the room.
 */
import { randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import type { Side } from '@sim/types.ts';
import { parseClientMessage } from './protocol.ts';
import type { ServerError, ServerMessage } from './protocol.ts';
import { Room } from './room.ts';

interface Lobby {
  room: Room | null;
  sockets: [WebSocket | null, WebSocket | null];
  names: [string, string];
}

interface Seat {
  lobbyId: string;
  side: Side;
}

const DEFAULT_PORT = 8787;
const SEED_LIMIT = 2 ** 32;

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  return Buffer.from(data as ArrayBuffer).toString();
}

function send(socket: WebSocket | null, message: ServerMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export interface GameServer {
  readonly port: number;
  close(): Promise<void>;
}

/** Start the server. Pass port 0 to pick a free one. */
export async function startServer(port = DEFAULT_PORT): Promise<GameServer> {
  const wss = new WebSocketServer({ port });
  await new Promise<void>((resolve) => wss.once('listening', resolve));
  const lobbies = new Map<string, Lobby>();
  const seats = new WeakMap<WebSocket, Seat>();

  const broadcastState = (lobby: Lobby): void => {
    const { room } = lobby;
    if (!room) return;
    for (const side of room.seats)
      send(lobby.sockets[side], { type: 'state', state: room.view(side) });
  };

  const fail = (socket: WebSocket, error: ServerError): void => {
    send(socket, { type: 'error', error });
  };

  const join = (socket: WebSocket, roomId: string, name: string): void => {
    if (seats.has(socket)) {
      fail(socket, 'already-joined');
      return;
    }
    const lobby = lobbies.get(roomId) ?? { room: null, sockets: [null, null], names: ['', ''] };
    const side: Side | null = lobby.sockets[0] === null ? 0 : lobby.sockets[1] === null ? 1 : null;
    if (side === null) {
      fail(socket, 'room-full');
      return;
    }
    lobbies.set(roomId, lobby);
    lobby.sockets[side] = socket;
    lobby.names[side] = name;
    seats.set(socket, { lobbyId: roomId, side });
    send(socket, { type: 'joined', room: roomId, side });
    if (lobby.sockets[0] && lobby.sockets[1]) {
      lobby.room = new Room(randomInt(SEED_LIMIT), lobby.names);
      broadcastState(lobby);
    } else {
      send(socket, { type: 'waiting' });
    }
  };

  wss.on('connection', (socket) => {
    socket.on('message', (data: RawData) => {
      const message = parseClientMessage(rawToString(data));
      if (!message) {
        fail(socket, 'bad-message');
        return;
      }
      if (message.type === 'join') {
        join(socket, message.room, message.name);
        return;
      }
      const seat = seats.get(socket);
      const lobby = seat ? lobbies.get(seat.lobbyId) : undefined;
      if (!seat || !lobby?.room) {
        fail(socket, 'not-joined');
        return;
      }
      const outcome = lobby.room.handle(seat.side, message);
      if (!outcome.ok) {
        fail(socket, outcome.error);
        return;
      }
      if (outcome.fight) {
        for (const s of lobby.sockets) send(s, { type: 'fight', ...outcome.fight });
      }
      broadcastState(lobby);
    });
    socket.on('close', () => {
      const seat = seats.get(socket);
      const lobby = seat ? lobbies.get(seat.lobbyId) : undefined;
      if (!seat || !lobby) return;
      lobbies.delete(seat.lobbyId);
      for (const s of lobby.sockets) {
        if (s && s !== socket) send(s, { type: 'opponent-left' });
      }
    });
  });

  const address = wss.address();
  return {
    port: address !== null && typeof address === 'object' ? address.port : port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close(() => {
          resolve();
        });
      }),
  };
}
