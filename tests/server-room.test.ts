import { describe, expect, it } from 'vitest';
import { poolTotal } from '../src/sim/shop.ts';
import { Room } from '../src/server/room.ts';

function firstBuyableSlot(room: Room, side: 0 | 1): number {
  const slot = room.game.players[side].shop.slots.findIndex((s) => s !== null);
  expect(slot).toBeGreaterThanOrEqual(0);
  return slot;
}

describe('Room', () => {
  it('starts in prep for both seats at once', () => {
    const room = new Room(1);
    expect(room.game.phase).toBe('prep');
    expect(room.game.players.every((p) => !p.isAI)).toBe(true);
    // Either seat may act without waiting for the other.
    expect(room.handle(1, { type: 'lock' }).ok).toBe(true);
    expect(room.handle(0, { type: 'lock' }).ok).toBe(true);
  });

  it('applies valid intents and rejects invalid ones without changing state', () => {
    const room = new Room(2);
    const gold = room.game.players[0].econ.gold;
    const slot = firstBuyableSlot(room, 0);
    expect(room.handle(0, { type: 'buy', slot }).ok).toBe(true);
    expect(room.game.players[0].econ.gold).toBeLessThan(gold);

    const before = JSON.stringify(room.game.players[0]);
    expect(room.handle(0, { type: 'buy', slot: 99 })).toEqual({ ok: false, error: 'rejected' });
    expect(room.handle(0, { type: 'sell', pieceId: 999 })).toEqual({ ok: false, error: 'invalid' });
    expect(
      room.handle(0, { type: 'place', pieceId: 1, to: { kind: 'board', x: 15, y: 0 } }).ok,
    ).toBe(false);
    expect(JSON.stringify(room.game.players[0])).toBe(before);
  });

  it("refuses to place on the opponent's board", () => {
    const room = new Room(3);
    room.handle(0, { type: 'buy', slot: firstBuyableSlot(room, 0) });
    const piece = room.game.players[0].holdings.bench.find((p) => p !== null);
    expect(piece).toBeDefined();
    const result = room.handle(0, {
      type: 'place',
      pieceId: piece?.id ?? -1,
      to: { kind: 'board', x: 12, y: 1 },
    });
    expect(result).toEqual({ ok: false, error: 'invalid' });
    expect(room.game.players[0].holdings.board).toHaveLength(0);
  });

  it('ignores a seat once it is ready', () => {
    const room = new Room(4);
    expect(room.handle(0, { type: 'ready' })).toEqual({ ok: true, fight: null });
    expect(room.handle(0, { type: 'reroll' })).toEqual({ ok: false, error: 'already-ready' });
    expect(room.view(1).opponent.ready).toBe(true);
    expect(room.view(0).you.ready).toBe(true);
  });

  it('runs the fight once both seats are ready, then starts the next round', () => {
    const room = new Room(5);
    for (const side of [0, 1] as const) {
      room.handle(side, { type: 'buy', slot: firstBuyableSlot(room, side) });
      const piece = room.game.players[side].holdings.bench.find((p) => p !== null);
      const x = side === 0 ? 1 : 12;
      room.handle(side, {
        type: 'place',
        pieceId: piece?.id ?? -1,
        to: { kind: 'board', x, y: 3 },
      });
    }
    room.handle(0, { type: 'ready' });
    const outcome = room.handle(1, { type: 'ready' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.fight) throw new Error('expected a fight');
    expect(outcome.fight.round).toBe(1);
    expect(outcome.fight.army).toHaveLength(2);
    expect(outcome.fight.events.length).toBeGreaterThan(0);
    expect(room.game.round).toBe(2);
    expect(room.game.phase).toBe('prep');
    expect(room.view(0).you.ready).toBe(false);
  });

  it('is deterministic: same seed and intents give the same fight', () => {
    const play = (): string => {
      const room = new Room(6);
      for (const side of [0, 1] as const) {
        room.handle(side, { type: 'buy', slot: firstBuyableSlot(room, side) });
        const piece = room.game.players[side].holdings.bench.find((p) => p !== null);
        room.handle(side, {
          type: 'place',
          pieceId: piece?.id ?? -1,
          to: { kind: 'board', x: side === 0 ? 2 : 13, y: 4 },
        });
      }
      room.handle(0, { type: 'ready' });
      return JSON.stringify(room.handle(1, { type: 'ready' }));
    };
    expect(play()).toBe(play());
  });

  it('hides the opponent shop, bench and board', () => {
    const room = new Room(7);
    const view = room.view(0);
    expect(Object.keys(view.opponent).sort()).toEqual(['hp', 'level', 'name', 'ready']);
    expect(view.opponent).not.toHaveProperty('shop');
    expect(view.opponent).not.toHaveProperty('holdings');
  });

  it('conserves the piece pool across buys, sells and rerolls', () => {
    const room = new Room(8);
    const total = (): number =>
      poolTotal(room.game.pool) +
      room.game.players.reduce((sum, p) => {
        const shop = p.shop.slots.filter((s) => s !== null).length;
        const bench = p.holdings.bench.filter((s) => s !== null);
        const held = [...bench, ...p.holdings.board].reduce(
          (n, piece) => n + 3 ** (piece.stars - 1),
          0,
        );
        return sum + shop + held;
      }, 0);
    const start = total();
    room.handle(0, { type: 'buy', slot: firstBuyableSlot(room, 0) });
    room.handle(0, { type: 'reroll' });
    const piece = room.game.players[0].holdings.bench.find((p) => p !== null);
    room.handle(0, { type: 'sell', pieceId: piece?.id ?? -1 });
    expect(total()).toBe(start);
  });

  it('plays a whole match to game over through intents alone', () => {
    const room = new Room(9);
    for (let i = 0; i < 300 && room.game.phase !== 'over'; i++) {
      room.handle(0, { type: 'ready' });
      room.handle(1, { type: 'ready' });
    }
    expect(room.game.phase).toBe('over');
    expect(room.handle(0, { type: 'ready' })).toEqual({ ok: false, error: 'wrong-phase' });
  });
});
