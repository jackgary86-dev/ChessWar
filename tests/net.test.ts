import { describe, expect, it } from 'vitest';
import { createNetClient } from '../src/ui/net.ts';
import type { NetStatus, SocketLike } from '../src/ui/net.ts';
import type { ServerMessage } from '../src/server/protocol.ts';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  closed = false;
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function setup(maxRetries = 3) {
  const sockets: FakeSocket[] = [];
  const timers: (() => void)[] = [];
  const messages: ServerMessage[] = [];
  const statuses: NetStatus[] = [];
  const client = createNetClient({
    url: 'ws://test',
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    retryMs: 10,
    maxRetries,
    setTimer: (fn) => timers.push(fn),
    clearTimer: () => {
      timers.length = 0;
    },
  });
  const last = (): FakeSocket => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('no socket');
    return socket;
  };
  return { client, sockets, timers, messages, statuses, last };
}

const JOINED = { type: 'joined', room: 'AB2C', side: 0, token: 'tok' };

describe('createNetClient', () => {
  it('reports open, forwards messages and sends JSON', () => {
    const t = setup();
    expect(t.client.status()).toBe('connecting');
    t.last().onopen?.();
    expect(t.statuses).toEqual(['open']);
    t.last().receive({ type: 'lobby', room: 'AB2C', seats: [null, null] });
    expect(t.messages).toHaveLength(1);
    t.client.send({ type: 'ready' });
    expect(t.last().sent).toEqual([{ type: 'ready' }]);
  });

  it('ignores garbage from the server', () => {
    const t = setup();
    t.last().onopen?.();
    t.last().onmessage?.({ data: 'not json' });
    t.last().onmessage?.({ data: '[1]' });
    t.last().onmessage?.({ data: new ArrayBuffer(1) });
    expect(t.messages).toEqual([]);
  });

  it('does not reconnect before a seat was issued', () => {
    const t = setup();
    t.last().onopen?.();
    t.last().onclose?.();
    expect(t.client.status()).toBe('closed');
    expect(t.timers).toHaveLength(0);
  });

  it('reconnects and rejoins with the seat token', () => {
    const t = setup();
    t.last().onopen?.();
    t.last().receive(JOINED);
    t.last().onclose?.();
    expect(t.client.status()).toBe('reconnecting');
    t.timers.shift()?.();
    expect(t.sockets).toHaveLength(2);
    t.last().onopen?.();
    expect(t.client.status()).toBe('open');
    expect(t.last().sent).toEqual([{ type: 'rejoin', room: 'AB2C', token: 'tok' }]);
  });

  it('gives up after the retry limit', () => {
    const t = setup(2);
    t.last().onopen?.();
    t.last().receive(JOINED);
    t.last().onclose?.();
    t.timers.shift()?.();
    t.last().onclose?.();
    t.timers.shift()?.();
    t.last().onclose?.();
    expect(t.client.status()).toBe('closed');
    expect(t.timers).toHaveLength(0);
  });

  it('forgets the seat when the server refuses the rejoin', () => {
    const t = setup();
    t.last().onopen?.();
    t.last().receive(JOINED);
    t.last().onclose?.();
    t.timers.shift()?.();
    t.last().onopen?.();
    t.last().receive({ type: 'error', error: 'no-such-room' });
    t.last().onclose?.();
    expect(t.client.status()).toBe('closed');
  });

  it('close() leaves for good without reconnecting', () => {
    const t = setup();
    t.last().onopen?.();
    t.last().receive(JOINED);
    t.client.close();
    expect(t.last().closed).toBe(true);
    expect(t.client.status()).toBe('closed');
    expect(t.timers).toHaveLength(0);
  });
});
