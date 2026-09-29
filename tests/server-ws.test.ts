import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../src/server/index.ts';
import type { GameServer } from '../src/server/index.ts';
import type { ServerMessage } from '../src/server/protocol.ts';

let server: GameServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await server?.close();
  server = null;
});

type Of<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

interface Client {
  send(message: unknown): void;
  close(): void;
  next<T extends ServerMessage['type']>(type: T): Promise<Of<T>>;
}

function never(): never {
  throw new Error('unreachable');
}

async function connect(port: number): Promise<Client> {
  const socket = new WebSocket(`ws://localhost:${String(port)}`);
  sockets.push(socket);
  const queue: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  socket.on('message', (data) => {
    queue.push(JSON.parse(Buffer.from(data as ArrayBuffer).toString()) as ServerMessage);
    for (const w of waiters.splice(0)) w();
  });
  await new Promise<void>((resolve) => socket.once('open', resolve));
  return {
    send: (m) => {
      socket.send(JSON.stringify(m));
    },
    close: () => {
      socket.close();
    },
    next: async <T extends ServerMessage['type']>(type: T): Promise<Of<T>> => {
      for (;;) {
        const i = queue.findIndex((m) => m.type === type);
        if (i >= 0) return (queue.splice(i, 1)[0] ?? never()) as Of<T>;
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

/** Two connected players in a fresh room, not yet ready. */
async function pair(opts: { forfeitMs?: number } = {}) {
  server = await startServer({ port: 0, ...opts });
  const a = await connect(server.port);
  const b = await connect(server.port);
  a.send({ type: 'create', name: 'Ann' });
  const ja = await a.next('joined');
  b.send({ type: 'join', room: ja.room.toLowerCase(), name: 'Bob' });
  const jb = await b.next('joined');
  return { a, b, ja, jb, port: server.port };
}

describe('lobby', () => {
  it('creates a room with a short code and lets a second player join by it', async () => {
    const { a, b, ja, jb } = await pair();
    expect(ja).toMatchObject({ side: 0 });
    expect(ja.room).toMatch(/^[A-Z2-9]{4}$/);
    expect(jb).toMatchObject({ side: 1, room: ja.room });
    expect(ja.token).not.toBe(jb.token);
    const lobby = await b.next('lobby');
    expect(lobby.seats.map((s) => s?.name)).toEqual(['Ann', 'Bob']);
    expect((await a.next('lobby')).seats[0]).toMatchObject({ connected: true, ready: false });
  });

  it('starts the match only when both players have readied up', async () => {
    const { a, b } = await pair();
    a.send({ type: 'ready' });
    await b.next('lobby'); // the join announcement
    const lobby = await b.next('lobby');
    expect(lobby.seats[0]?.ready).toBe(true);
    b.send({ type: 'ready' });
    const state = await a.next('state');
    expect(state.state).toMatchObject({ round: 1, phase: 'prep', side: 0 });
    expect((await b.next('state')).state.side).toBe(1);
  });

  it('relays intents and plays a fight once both are ready in prep', async () => {
    const { a, b } = await pair();
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.next('state');
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    const fight = await a.next('fight');
    expect(fight.round).toBe(1);
    expect(await b.next('fight')).toEqual(fight);
  });

  it('rejects bad codes, malformed messages, early intents, and a third player', async () => {
    const { port, ja } = await pair();
    const c = await connect(port);
    c.send('nonsense');
    expect(await c.next('error')).toEqual({ type: 'error', error: 'bad-message' });
    c.send({ type: 'buy', slot: 0 });
    expect(await c.next('error')).toEqual({ type: 'error', error: 'not-joined' });
    c.send({ type: 'join', room: 'ZZZZ', name: 'C' });
    expect(await c.next('error')).toEqual({ type: 'error', error: 'no-such-room' });
    c.send({ type: 'join', room: ja.room, name: 'C' });
    expect(await c.next('error')).toEqual({ type: 'error', error: 'room-full' });
  });

  it('refuses prep intents before the match starts', async () => {
    const { a } = await pair();
    a.send({ type: 'buy', slot: 0 });
    expect(await a.next('error')).toEqual({ type: 'error', error: 'wrong-phase' });
  });
});

describe('reconnect and forfeit', () => {
  it('lets a dropped player rejoin with their token and resends the state', async () => {
    const { a, b, ja, port } = await pair();
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.next('state');
    a.close();
    expect(await b.next('presence')).toMatchObject({ connected: false });

    const a2 = await connect(port);
    a2.send({ type: 'rejoin', room: ja.room, token: ja.token });
    expect(await a2.next('joined')).toMatchObject({ side: 0, token: ja.token });
    expect((await a2.next('state')).state).toMatchObject({ round: 1, side: 0 });
    expect(await b.next('presence')).toMatchObject({ connected: true });
  });

  it('rejects a rejoin with the wrong token', async () => {
    const { port, ja } = await pair();
    const c = await connect(port);
    c.send({ type: 'rejoin', room: ja.room, token: 'nope' });
    expect(await c.next('error')).toEqual({ type: 'error', error: 'bad-token' });
  });

  it('forfeits a player who does not return in time', async () => {
    const { a, b, ja, port } = await pair({ forfeitMs: 50 });
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await b.next('state');
    a.close();
    expect(await b.next('presence')).toEqual({ type: 'presence', connected: false, forfeitMs: 50 });
    expect(await b.next('forfeit')).toEqual({ type: 'forfeit', winner: 1 });

    // The room is gone, so the old token no longer works.
    const a2 = await connect(port);
    a2.send({ type: 'rejoin', room: ja.room, token: ja.token });
    expect(await a2.next('error')).toEqual({ type: 'error', error: 'no-such-room' });
  });

  it('lets a rejoin cancel the forfeit', async () => {
    const { a, b, ja, port } = await pair({ forfeitMs: 150 });
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await b.next('state');
    a.close();
    await b.next('presence');
    const a2 = await connect(port);
    a2.send({ type: 'rejoin', room: ja.room, token: ja.token });
    await a2.next('state');
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Still in the match: an intent gets a game answer, not "not-joined".
    a2.send({ type: 'buy', slot: 99 });
    expect((await a2.next('error')).error).toBe('rejected');
  });

  it('discards a lobby that everyone left before the match started', async () => {
    const { a, b, ja, port } = await pair();
    a.close();
    b.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const c = await connect(port);
    c.send({ type: 'join', room: ja.room, name: 'C' });
    expect(await c.next('error')).toEqual({ type: 'error', error: 'no-such-room' });
  });
});
