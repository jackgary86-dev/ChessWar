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

function never(): never {
  throw new Error('unreachable');
}

interface Client {
  send(message: unknown): void;
  next(type: ServerMessage['type']): Promise<ServerMessage>;
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
    next: async (type) => {
      for (;;) {
        const i = queue.findIndex((m) => m.type === type);
        if (i >= 0) return queue.splice(i, 1)[0] ?? never();
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

describe('websocket server', () => {
  it('pairs two players, relays intents and plays a fight', async () => {
    server = await startServer(0);
    const a = await connect(server.port);
    const b = await connect(server.port);
    a.send({ type: 'join', room: 'r1', name: 'Ann' });
    expect(await a.next('joined')).toMatchObject({ side: 0 });
    await a.next('waiting');
    b.send({ type: 'join', room: 'r1', name: 'Bob' });
    expect(await b.next('joined')).toMatchObject({ side: 1 });
    const state = await a.next('state');
    expect(state).toMatchObject({ state: { round: 1, phase: 'prep' } });

    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    const fight = await a.next('fight');
    expect(fight).toMatchObject({ round: 1 });
    expect(await b.next('fight')).toEqual(fight);
  });

  it('rejects malformed messages, early intents and a third player', async () => {
    server = await startServer(0);
    const a = await connect(server.port);
    a.send('nonsense');
    expect(await a.next('error')).toEqual({ type: 'error', error: 'bad-message' });
    a.send({ type: 'ready' });
    expect(await a.next('error')).toEqual({ type: 'error', error: 'not-joined' });

    a.send({ type: 'join', room: 'r2', name: 'A' });
    const b = await connect(server.port);
    b.send({ type: 'join', room: 'r2', name: 'B' });
    const c = await connect(server.port);
    c.send({ type: 'join', room: 'r2', name: 'C' });
    expect(await c.next('error')).toEqual({ type: 'error', error: 'room-full' });
  });

  it('tells the opponent when a player leaves', async () => {
    server = await startServer(0);
    const a = await connect(server.port);
    const b = await connect(server.port);
    a.send({ type: 'join', room: 'r3', name: 'A' });
    b.send({ type: 'join', room: 'r3', name: 'B' });
    await b.next('state');
    sockets[0]?.close();
    expect(await b.next('opponent-left')).toEqual({ type: 'opponent-left' });
  });
});
