import { describe, expect, it } from 'vitest';

import { createBattle, stepBattle } from '@sim/battle.ts';
import type { BattleEvent } from '@sim/battle.ts';
import { parseSquare } from '@sim/board.ts';
import { createRng } from '@sim/rng.ts';
import { loadMuted, MUTE_KEY, saveMuted } from '../src/ui/sound.ts';
import {
  CUE_TONES,
  cuesForEvents,
  MAX_SAME_CUE_PER_FRAME,
  roundCue,
} from '../src/ui/sound-model.ts';
import type { Cue } from '../src/ui/sound-model.ts';
import type { StorageLike } from '../src/ui/storage.ts';

function strike(tick: number, target = 1): BattleEvent {
  return { kind: 'strike', tick, attacker: 0, target, damage: 5, targetHp: 5, via: 'strike' };
}

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

const blocked: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('cue tones', () => {
  it('defines at least one valid tone for every cue', () => {
    const cues: Cue[] = ['buy', 'merge', 'strike', 'death', 'portal', 'win', 'loss'];
    for (const cue of cues) {
      expect(CUE_TONES[cue].length).toBeGreaterThan(0);
      for (const tone of CUE_TONES[cue]) {
        expect(tone.freq).toBeGreaterThan(0);
        expect(tone.duration).toBeGreaterThan(0);
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(1);
        expect(tone.start).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('cuesForEvents', () => {
  const events: BattleEvent[] = [
    { kind: 'move', tick: 1, unit: 0, from: parseSquare('a1'), to: parseSquare('a2') },
    strike(2),
    { kind: 'death', tick: 2, unit: 1, pos: parseSquare('b2') },
    { kind: 'portal', tick: 3, unit: 0, from: parseSquare('h6'), to: parseSquare('i6') },
  ];

  it('maps strikes, deaths and portal crossings, and skips moves', () => {
    const { cues, next } = cuesForEvents(events, 0, 10);
    expect(cues).toEqual(['strike', 'death', 'portal']);
    expect(next).toBe(events.length);
  });

  it('only fires events whose animation has started, and resumes where it stopped', () => {
    const first = cuesForEvents(events, 0, 0.5);
    expect(first.cues).toEqual([]);
    expect(first.next).toBe(1);
    const second = cuesForEvents(events, first.next, 1.5);
    expect(second.cues).toEqual(['strike', 'death']);
    const third = cuesForEvents(events, second.next, 2.5);
    expect(third.cues).toEqual(['portal']);
    expect(cuesForEvents(events, third.next, 99).cues).toEqual([]);
  });

  it('caps a burst of identical cues in one frame', () => {
    const burst = Array.from({ length: 6 }, () => strike(1));
    expect(cuesForEvents(burst, 0, 5).cues).toHaveLength(MAX_SAME_CUE_PER_FRAME);
  });

  it('plays every event kind of a real battle without throwing', () => {
    const battle = createBattle(
      [
        { type: 'Q', stars: 3, pos: parseSquare('g6') },
        { type: 'N', stars: 1, pos: parseSquare('j5') },
        { type: 'P', stars: 1, pos: parseSquare('k4') },
      ],
      createRng(2),
    );
    while (!battle.finished) stepBattle(battle);
    const { cues, next } = cuesForEvents(battle.events, 0, battle.tick + 1);
    expect(next).toBe(battle.events.length);
    expect(cues).toContain('strike');
    expect(cues).toContain('death');
  });
});

describe('roundCue', () => {
  it('is win or loss from the human’s side, and silent for a draw', () => {
    expect(roundCue(0, 0)).toBe('win');
    expect(roundCue(1, 0)).toBe('loss');
    expect(roundCue(null, 0)).toBeNull();
  });
});

describe('mute preference', () => {
  it('defaults to unmuted and remembers the choice', () => {
    const storage = memory();
    expect(loadMuted(storage)).toBe(false);
    saveMuted(storage, true);
    expect(storage.data.get(MUTE_KEY)).toBe('1');
    expect(loadMuted(storage)).toBe(true);
    saveMuted(storage, false);
    expect(loadMuted(storage)).toBe(false);
  });

  it('survives missing or blocked storage', () => {
    expect(loadMuted(null)).toBe(false);
    expect(loadMuted(blocked)).toBe(false);
    expect(() => {
      saveMuted(null, true);
      saveMuted(blocked, true);
    }).not.toThrow();
  });
});
