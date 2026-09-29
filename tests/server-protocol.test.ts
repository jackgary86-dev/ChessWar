import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/server/protocol.ts';

describe('parseClientMessage', () => {
  it('parses each intent', () => {
    expect(parseClientMessage('{"type":"buy","slot":2}')).toEqual({ type: 'buy', slot: 2 });
    expect(parseClientMessage('{"type":"sell","pieceId":7}')).toEqual({ type: 'sell', pieceId: 7 });
    expect(parseClientMessage('{"type":"reroll"}')).toEqual({ type: 'reroll' });
    expect(parseClientMessage('{"type":"lock"}')).toEqual({ type: 'lock' });
    expect(parseClientMessage('{"type":"buyXP"}')).toEqual({ type: 'buyXP' });
    expect(parseClientMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(
      parseClientMessage('{"type":"place","pieceId":1,"to":{"kind":"board","x":2,"y":3}}'),
    ).toEqual({ type: 'place', pieceId: 1, to: { kind: 'board', x: 2, y: 3 } });
    expect(
      parseClientMessage('{"type":"place","pieceId":1,"to":{"kind":"bench","slot":4}}'),
    ).toEqual({ type: 'place', pieceId: 1, to: { kind: 'bench', slot: 4 } });
  });

  it('parses join and tidies the name', () => {
    expect(parseClientMessage('{"type":"join","room":"abc","name":"  Ann  "}')).toEqual({
      type: 'join',
      room: 'abc',
      name: 'Ann',
    });
    expect(parseClientMessage('{"type":"join","room":"abc"}')).toMatchObject({ name: 'Player' });
  });

  it.each([
    'not json',
    '[]',
    '{"type":"nope"}',
    '{"type":"buy"}',
    '{"type":"buy","slot":1.5}',
    '{"type":"buy","slot":"1"}',
    '{"type":"place","pieceId":1,"to":{"kind":"board","x":1}}',
    '{"type":"place","pieceId":1}',
    '{"type":"join","room":""}',
    '{"type":"join","room":5}',
    '{"type":"ready","gold":999}x',
  ])('rejects %s', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  it('ignores extra fields a client might add, such as claimed state', () => {
    expect(parseClientMessage('{"type":"buy","slot":0,"gold":999}')).toEqual({
      type: 'buy',
      slot: 0,
    });
  });
});
