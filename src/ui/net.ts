/**
 * Browser side of online play: one WebSocket to the game server, with
 * automatic reconnect. Once the server has issued a seat token (`joined`), a
 * dropped connection is retried and the seat reclaimed with `rejoin`, so the
 * server resends the current state.
 *
 * The socket and timer are injected so the reconnect logic is unit-testable.
 */
import type { ClientMessage, ServerMessage } from '../server/protocol.ts';

export type NetStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** The slice of the browser WebSocket API this module uses. */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface NetOptions {
  url: string;
  createSocket: (url: string) => SocketLike;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: NetStatus) => void;
  /** Delay between reconnect attempts. */
  retryMs: number;
  /** Attempts in a row before giving up. */
  maxRetries: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface NetClient {
  send(message: ClientMessage): void;
  /** Leave for good: no reconnect. */
  close(): void;
  status(): NetStatus;
}

function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

export function createNetClient(options: NetOptions): NetClient {
  const setTimer =
    options.setTimer ??
    ((fn, ms) => {
      return setTimeout(fn, ms);
    });
  const clearTimer =
    options.clearTimer ??
    ((handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    });
  let socket: SocketLike | null = null;
  let status: NetStatus = 'connecting';
  let seat: { room: string; token: string } | null = null;
  let retries = 0;
  let timer: unknown = null;
  let leaving = false;

  const setStatus = (next: NetStatus): void => {
    if (status === next) return;
    status = next;
    options.onStatus(next);
  };

  const connect = (): void => {
    const s = options.createSocket(options.url);
    socket = s;
    s.onopen = () => {
      retries = 0;
      setStatus('open');
      if (seat) s.send(JSON.stringify({ type: 'rejoin', room: seat.room, token: seat.token }));
    };
    s.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!isServerMessage(parsed)) return;
      if (parsed.type === 'joined') seat = { room: parsed.room, token: parsed.token };
      // A rejoin that the server refuses means the seat is gone for good.
      if (
        parsed.type === 'error' &&
        seat &&
        (parsed.error === 'no-such-room' || parsed.error === 'bad-token')
      ) {
        seat = null;
      }
      options.onMessage(parsed);
    };
    s.onclose = () => {
      if (socket !== s) return;
      socket = null;
      if (leaving) return;
      if (seat && retries < options.maxRetries) {
        retries += 1;
        setStatus('reconnecting');
        timer = setTimer(connect, options.retryMs);
      } else {
        setStatus('closed');
      }
    };
  };
  connect();

  return {
    send(message) {
      socket?.send(JSON.stringify(message));
    },
    close() {
      leaving = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      const s = socket;
      socket = null;
      s?.close();
      setStatus('closed');
    },
    status: () => status,
  };
}
