/**
 * Web Audio playback of the synthesized cues, with a mute toggle remembered
 * per browser. The audio context is created only after a user interaction
 * (browsers block it before), and every storage call is wrapped in try/catch.
 */
import { CUE_TONES } from './sound-model.ts';
import type { Cue } from './sound-model.ts';
import type { StorageLike } from './storage.ts';

export const MUTE_KEY = 'chesswar.muted';

export interface Sound {
  play: (cue: Cue) => void;
  isMuted: () => boolean;
  setMuted: (muted: boolean) => void;
}

/** Was sound muted last time? Defaults to unmuted when storage is unavailable. */
export function loadMuted(storage: StorageLike | null): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(storage: StorageLike | null, muted: boolean): void {
  try {
    storage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // The choice just isn't remembered.
  }
}

export function createSound(storage: StorageLike | null): Sound {
  let muted = loadMuted(storage);
  let context: AudioContext | null = null;
  let unlocked = false;

  const unlock = (): void => {
    unlocked = true;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  const audio = (): AudioContext | null => {
    if (!unlocked) return null;
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume();
      return context;
    } catch {
      return null;
    }
  };

  return {
    play(cue) {
      if (muted) return;
      const ctx = audio();
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const tone of CUE_TONES[cue]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const begin = now + tone.start;
        const end = begin + tone.duration;
        osc.type = tone.wave;
        osc.frequency.setValueAtTime(tone.freq, begin);
        if (tone.slideTo !== undefined) osc.frequency.linearRampToValueAtTime(tone.slideTo, end);
        gain.gain.setValueAtTime(tone.gain, begin);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(ctx.destination);
        osc.start(begin);
        osc.stop(end);
      }
    },
    isMuted: () => muted,
    setMuted(value) {
      muted = value;
      saveMuted(storage, value);
    },
  };
}
