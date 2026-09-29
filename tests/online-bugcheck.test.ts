/**
 * Bug check for online play (ticket 050): forged and out-of-turn intents,
 * matching results on both clients, reconnects, and room isolation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../src/server/index.ts';
import type { GameServer } from '../src/server/index.ts';
import { parseClientMessage } from '../src/server/protocol.ts';
import type { SeatView, ServerMessage } from '../src/server/protocol.ts';
import type { PieceType } from '../src/sim/types.ts';
import { Room } from '../src/server/room.ts';
import { PIECES, boardCap } from '../src/sim/data.ts';
import { poolTotal } from '../src/sim/shop.ts';

const SIDES = [0, 1] as const;
const FAR_SLOT = 10_000;
const HUGE_GOLD = 999;

function slotWithCard(room: Room, side: 0 | 1): number {
  return room.game.players[side].shop.slots.findIndex((s) => s !== null);
}

/** Everything the room holds that a forged intent must not change. */
function fingerprint(room: Room): string {
  return JSON.stringify({ players: room.game.players, pool: poolTotal(room.game.pool) });
}

describe('forged intents are rejected and change nothing', () => {
  it('rejects malformed slots, ids and targets', () => {
    const room = new Room(11);
    const before = fingerprint(room);
    const forged = [
      { type: 'buy', slot: -1 },
      { type: 'buy', slot: FAR_SLOT },
      { type: 'sell', pieceId: -5 },
      { type: 'sell', pieceId: FAR_SLOT },
      { type: 'place', pieceId: 0, to: { kind: 'bench', slot: -1 } },
      { type: 'place', pieceId: 0, to: { kind: 'bench', slot: FAR_SLOT } },
      { type: 'place', pieceId: 0, to: { kind: 'board', x: -3, y: 99 } },
    ] as const;
    for (const intent of forged) {
      expect(room.handle(0, intent).ok, JSON.stringify(intent)).toBe(false);
    }
    expect(fingerprint(room)).toBe(before);
  });

  it('cannot buy without the gold, even repeatedly', () => {
    const room = new Room(12);
    const player = room.game.players[0];
    for (let i = 0; i < 50; i++) room.handle(0, { type: 'reroll' });
    expect(player.econ.gold).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 50; i++) room.handle(0, { type: 'buyXP' });
    expect(player.econ.gold).toBeGreaterThanOrEqual(0);
    for (let slot = 0; slot < player.shop.slots.length; slot++) {
      room.handle(0, { type: 'buy', slot });
      expect(player.econ.gold).toBeGreaterThanOrEqual(0);
    }
  });

  it('cannot field more pieces than the level allows', () => {
    const room = new Room(13);
    const player = room.game.players[0];
    player.econ.gold = HUGE_GOLD; // test setup only: the wire has no way to do this
    for (let i = 0; i < 12; i++) room.handle(0, { type: 'reroll' });
    for (let slot = 0; slot < player.shop.slots.length; slot++)
      room.handle(0, { type: 'buy', slot });
    let x = 0;
    for (const piece of player.holdings.bench) {
      if (!piece) continue;
      room.handle(0, { type: 'place', pieceId: piece.id, to: { kind: 'board', x: x++ % 4, y: 0 } });
      expect(player.holdings.board.length).toBeLessThanOrEqual(boardCap(player.econ.level));
    }
  });

  it("cannot touch the other seat's pieces", () => {
    const room = new Room(14);
    room.handle(1, { type: 'buy', slot: slotWithCard(room, 1) });
    const theirs = room.game.players[1].holdings.bench.find((p) => p !== null);
    expect(theirs).toBeDefined();
    const before = JSON.stringify(room.game.players[1]);
    // Seat 0 quotes seat 1's piece id. Ids are per seat, so it only ever resolves to seat 0's own pieces.
    room.handle(0, { type: 'sell', pieceId: theirs?.id ?? -1 });
    room.handle(0, { type: 'place', pieceId: theirs?.id ?? -1, to: { kind: 'board', x: 1, y: 1 } });
    expect(JSON.stringify(room.game.players[1])).toBe(before);
    expect(room.game.players[0].holdings.board).toHaveLength(0);
  });

  it('accepts no intent from a seat that is ready, or outside prep', () => {
    const room = new Room(15);
    room.handle(0, { type: 'ready' });
    const before = fingerprint(room);
    for (const intent of [
      { type: 'buy', slot: slotWithCard(room, 0) },
      { type: 'reroll' },
      { type: 'buyXP' },
      { type: 'lock' },
    ] as const) {
      expect(room.handle(0, intent)).toEqual({ ok: false, error: 'already-ready' });
    }
    expect(fingerprint(room)).toBe(before);
  });

  it('keeps a seat from readying twice to run the fight alone', () => {
    const room = new Room(16);
    expect(room.handle(0, { type: 'ready' })).toEqual({ ok: true, fight: null });
    expect(room.handle(0, { type: 'ready' })).toEqual({ ok: false, error: 'already-ready' });
    expect(room.game.round).toBe(1);
  });

  it('ignores extra fields that claim gold, side or state', () => {
    const parsed = parseClientMessage(
      JSON.stringify({
        type: 'buy',
        slot: 0,
        gold: HUGE_GOLD,
        side: 1,
        cost: 0,
        __proto__: { x: 1 },
      }),
    );
    expect(parsed).toEqual({ type: 'buy', slot: 0 });
    for (const raw of [
      '{"type":"buy","slot":"0"}',
      '{"type":"buy","slot":0.5}',
      '{"type":"buy","slot":null}',
      '{"type":"place","pieceId":1,"to":{"kind":"board","x":"1","y":1}}',
      '{"type":"constructor"}',
      '{"type":"__proto__"}',
      '[]',
      'null',
      '"buy"',
    ]) {
      expect(parseClientMessage(raw), raw).toBeNull();
    }
  });

  it('never shows one seat the other seat’s shop, bench or board', () => {
    const room = new Room(17);
    room.handle(1, { type: 'buy', slot: slotWithCard(room, 1) });
    const view = JSON.stringify(room.view(0));
    expect(view).not.toContain(JSON.stringify(room.game.players[1].holdings));
    expect(Object.keys(room.view(0).opponent).sort()).toEqual(['hp', 'level', 'name', 'ready']);
  });
});

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
  /** The next state message for the given round (skips earlier ones). */
  stateForRound(round: number): Promise<Of<'state'>>;
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
    stateForRound: async (round) => {
      for (;;) {
        const i = queue.findIndex((m) => m.type === 'state' && m.state.round === round);
        const found = i >= 0 ? queue.splice(i, 1)[0] : undefined;
        if (found) return found as Of<'state'>;
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
    next: async <T extends ServerMessage['type']>(type: T): Promise<Of<T>> => {
      for (;;) {
        const i = queue.findIndex((m) => m.type === type);
        const found = i >= 0 ? queue.splice(i, 1)[0] : undefined;
        if (found) return found as Of<T>;
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

interface Match {
  a: Client;
  b: Client;
  room: string;
  tokens: [string, string];
  port: number;
}

/** Two players in a started match, both looking at round 1 prep. */
async function startedMatch(port: number): Promise<Match> {
  const a = await connect(port);
  const b = await connect(port);
  a.send({ type: 'create', name: 'Ann' });
  const ja = await a.next('joined');
  b.send({ type: 'join', room: ja.room, name: 'Bob' });
  const jb = await b.next('joined');
  a.send({ type: 'ready' });
  b.send({ type: 'ready' });
  await a.next('state');
  await b.next('state');
  return { a, b, room: ja.room, tokens: [ja.token, jb.token], port };
}

describe('two clients agree', () => {
  it('get the same fight, and views that mirror each other, every round', async () => {
    server = await startServer({ port: 0 });
    const { a, b } = await startedMatch(server.port);
    for (let round = 1; round <= 3; round++) {
      a.send({ type: 'ready' });
      b.send({ type: 'ready' });
      const [fa, fb] = await Promise.all([a.next('fight'), b.next('fight')]);
      expect(fb).toEqual(fa);
      const [sa, sb] = await Promise.all([a.stateForRound(round + 1), b.stateForRound(round + 1)]);
      const [va, vb]: SeatView[] = [sa.state, sb.state];
      expect(va.round).toBe(round + 1);
      expect(vb.round).toBe(va.round);
      expect(va.you.hp).toBe(vb.opponent.hp);
      expect(vb.you.hp).toBe(va.opponent.hp);
      expect(va.side).toBe(0);
      expect(vb.side).toBe(1);
    }
  });
});

describe('reconnect', () => {
  it('mid-prep restores purchases and gold exactly', async () => {
    server = await startServer({ port: 0 });
    const { a, b, room, tokens, port } = await startedMatch(server.port);
    const shop = (
      await (async () => {
        a.send({ type: 'lock' });
        return a.next('state');
      })()
    ).state.you;
    const cost = (c: string | null): number =>
      c === null ? Infinity : PIECES[c as PieceType].cost;
    const slot = shop.shop.slots.reduce(
      (best, c, i) => (cost(c) < cost(shop.shop.slots[best] ?? null) ? i : best),
      0,
    );
    expect(cost(shop.shop.slots[slot] ?? null)).toBeLessThanOrEqual(shop.econ.gold);
    a.send({ type: 'buy', slot });
    const before = (await a.next('state')).state;
    a.close();
    await b.next('presence');
    const a2 = await connect(port);
    a2.send({ type: 'rejoin', room, token: tokens[0] });
    await a2.next('joined');
    const after = (await a2.next('state')).state;
    expect(after).toEqual(before);
    expect(after.you.holdings.bench.some((p) => p !== null)).toBe(true);
  });

  it('after a fight, and with both seats dropping and returning, the match carries on', async () => {
    server = await startServer({ port: 0 });
    const { a, b, room, tokens, port } = await startedMatch(server.port);
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.next('fight');
    const roundTwo = (await a.stateForRound(2)).state;
    await b.next('fight');
    const roundTwoB = (await b.stateForRound(2)).state;
    a.close();
    b.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const a2 = await connect(port);
    const b2 = await connect(port);
    a2.send({ type: 'rejoin', room, token: tokens[0] });
    b2.send({ type: 'rejoin', room, token: tokens[1] });
    expect((await a2.next('state')).state).toEqual(roundTwo);
    expect((await b2.next('state')).state).toEqual(roundTwoB);
    a2.send({ type: 'ready' });
    b2.send({ type: 'ready' });
    expect((await a2.next('fight')).round).toBe(2);
    expect((await b2.next('fight')).round).toBe(2);
  });

  it('a stolen or guessed token from another room does not work', async () => {
    server = await startServer({ port: 0 });
    const one = await startedMatch(server.port);
    const two = await startedMatch(server.port);
    const thief = await connect(server.port);
    thief.send({ type: 'rejoin', room: two.room, token: one.tokens[0] });
    expect((await thief.next('error')).error).toBe('bad-token');
  });
});

describe('rooms are isolated', () => {
  it('actions in one room never show up in another', async () => {
    server = await startServer({ port: 0 });
    const one = await startedMatch(server.port);
    const two = await startedMatch(server.port);
    expect(one.room).not.toBe(two.room);

    one.a.send({ type: 'lock' });
    const changed = (await one.a.next('state')).state;
    await one.b.next('state');
    expect(changed.you.shop.locked).toBe(true);

    // Room two only moves when room two acts.
    two.a.send({ type: 'reroll' });
    const twoView = (await two.a.next('state')).state;
    expect(twoView.round).toBe(1);
    expect(twoView.you.shop.locked).toBe(false);

    // Fighting in room one leaves room two in round 1 prep.
    one.a.send({ type: 'ready' });
    one.b.send({ type: 'ready' });
    await one.a.next('fight');
    two.b.send({ type: 'lock' });
    const twoAfter = (await two.b.next('state')).state;
    expect(twoAfter.round).toBe(1);
    expect(twoAfter.phase).toBe('prep');
  });
});

describe('sides', () => {
  it('each seat is bound to its own side for every intent', () => {
    for (const side of SIDES) {
      const room = new Room(20 + side);
      const other = side === 0 ? 1 : 0;
      const otherBefore = JSON.stringify(room.game.players[other]);
      room.handle(side, { type: 'buy', slot: slotWithCard(room, side) });
      room.handle(side, { type: 'reroll' });
      expect(JSON.stringify(room.game.players[other])).toBe(otherBefore);
    }
  });
});
