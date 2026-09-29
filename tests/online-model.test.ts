import { describe, expect, it } from 'vitest';
import { Room } from '../src/server/room.ts';
import type { ServerMessage } from '../src/server/protocol.ts';
import {
  battleFromFight,
  connectionNote,
  initialOnlineState,
  mirrorGame,
  onlineOverlay,
  onlineReduce,
} from '../src/ui/online-model.ts';
import type { OnlineState } from '../src/ui/online-model.ts';
import { frameAt, snapshotUnits } from '../src/ui/animation.ts';
import { dockView, scoreboardView } from '../src/ui/hud-model.ts';
import { overlayView, visiblePrepSides } from '../src/ui/overlays-model.ts';
import { withResult } from '../src/ui/online-model.ts';

type Fight = Extract<ServerMessage, { type: 'fight' }>;

function playOneRound(): { room: Room; fight: Fight } {
  const room = new Room(11);
  for (const side of [0, 1] as const) {
    const slot = room.game.players[side].shop.slots.findIndex((s) => s !== null);
    room.handle(side, { type: 'buy', slot });
    const piece = room.game.players[side].holdings.bench.find((p) => p !== null);
    room.handle(side, {
      type: 'place',
      pieceId: piece?.id ?? -1,
      to: { kind: 'board', x: side === 0 ? 2 : 13, y: 4 },
    });
  }
  room.handle(0, { type: 'ready' });
  const outcome = room.handle(1, { type: 'ready' });
  if (!outcome.ok || !outcome.fight) throw new Error('no fight');
  return { room, fight: { type: 'fight', ...outcome.fight } };
}

describe('onlineReduce', () => {
  it('tracks seat, lobby, state and presence', () => {
    let s = initialOnlineState();
    s = onlineReduce(s, { type: 'status', status: 'open' });
    s = onlineReduce(s, { type: 'joined', room: 'AB2C', side: 1, token: 't' });
    s = onlineReduce(s, { type: 'lobby', room: 'AB2C', seats: [null, null] });
    expect(s).toMatchObject({ status: 'open', room: 'AB2C', side: 1 });
    s = onlineReduce(s, { type: 'presence', connected: false, forfeitMs: 5000 });
    expect(s.opponentAwayMs).toBe(5000);
    s = onlineReduce(s, { type: 'presence', connected: true, forfeitMs: null });
    expect(s.opponentAwayMs).toBeNull();
    s = onlineReduce(s, { type: 'forfeit', winner: 0 });
    expect(s.forfeitWinner).toBe(0);
    s = onlineReduce(s, { type: 'error', error: 'room-full' });
    expect(s.error).toBe('room-full');
  });
});

describe('mirrorGame', () => {
  it('shows the player in full and hides the opponent', () => {
    const room = new Room(3);
    const view = room.view(1);
    const game = mirrorGame(view);
    expect(game.active).toBe(1);
    expect(game.players[1].shop.slots).toEqual(room.game.players[1].shop.slots);
    expect(game.players[0].name).toBe('Player 1');
    expect(game.players[0].shop.slots.every((s) => s === null)).toBe(true);
    expect(visiblePrepSides(game)).toEqual([1]);
    const [card0] = scoreboardView(game);
    expect(card0.gold).toBeNull();
    expect(dockView(game, null).enabled).toBe(true);
  });

  it('disables the dock once the player is ready', () => {
    const room = new Room(3);
    room.handle(0, { type: 'ready' });
    expect(dockView(mirrorGame(room.view(0)), null).enabled).toBe(false);
    expect(dockView(mirrorGame(room.view(1)), null).enabled).toBe(true);
  });
});

describe('battleFromFight', () => {
  it('makes a finished battle the animation can play', () => {
    const { fight } = playOneRound();
    const battle = battleFromFight(fight);
    expect(battle.finished).toBe(true);
    expect(battle.units).toHaveLength(fight.army.length);
    expect(battle.tick).toBeGreaterThan(0);
    const frame = frameAt(snapshotUnits(battle), battle.events, 0, true);
    expect(frame.pieces).toHaveLength(fight.army.length);
  });

  it('shows the fight result through the normal result overlay', () => {
    const { room, fight } = playOneRound();
    const game = withResult(mirrorGame(room.view(0)), fight.result);
    const overlay = overlayView(game, { started: true, animationDone: true });
    expect(overlay?.kind).toBe('result');
  });
});

describe('onlineOverlay', () => {
  const base = (over: Partial<OnlineState>): OnlineState => ({
    ...initialOnlineState('open'),
    ...over,
  });

  it('is null when not online', () => {
    expect(onlineOverlay(null)).toBeNull();
  });

  it('walks connecting → menu → lobby → board', () => {
    expect(onlineOverlay(initialOnlineState('connecting'))).toMatchObject({
      kind: 'online-status',
      title: 'Connecting…',
    });
    expect(onlineOverlay(base({}))).toMatchObject({ kind: 'online-menu', error: null });
    expect(onlineOverlay(base({ error: 'no-such-room' }))).toMatchObject({
      kind: 'online-menu',
      error: 'No room with that code.',
    });
    const lobby = onlineOverlay(
      base({
        room: 'AB2C',
        side: 0,
        lobby: [{ name: 'A', ready: true, connected: true }, null],
      }),
    );
    expect(lobby).toMatchObject({ kind: 'online-lobby', room: 'AB2C', youReady: true });
    const view = new Room(1).view(0);
    expect(onlineOverlay(base({ room: 'AB2C', side: 0, view }))).toBeNull();
  });

  it('shows reconnecting, disconnected and forfeit screens', () => {
    expect(onlineOverlay(base({ status: 'reconnecting' }))).toMatchObject({
      title: 'Reconnecting…',
    });
    expect(onlineOverlay(base({ status: 'closed' }))).toMatchObject({ title: 'Disconnected' });
    expect(onlineOverlay(base({ side: 0, forfeitWinner: 0 }))).toMatchObject({ title: 'You win' });
    expect(onlineOverlay(base({ side: 0, forfeitWinner: 1 }))).toMatchObject({
      title: 'You forfeited',
    });
  });
});

describe('connectionNote', () => {
  it('reports reconnecting, an absent opponent and waiting', () => {
    const view = new Room(1).view(0);
    expect(connectionNote(initialOnlineState('reconnecting'))).toMatch(/Reconnecting/);
    expect(connectionNote({ ...initialOnlineState('open'), opponentAwayMs: 4200 })).toMatch(
      /forfeit in 5 s/,
    );
    expect(connectionNote({ ...initialOnlineState('open'), view })).toBeNull();
    const ready = { ...view, you: { ...view.you, ready: true } };
    expect(connectionNote({ ...initialOnlineState('open'), view: ready })).toMatch(/Waiting/);
  });
});
