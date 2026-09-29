/**
 * Which sound plays when, and what each sound is made of.
 *
 * Sounds are synthesized from a few oscillator tones, so there are no audio
 * files to ship. Pure data and functions: `sound.ts` plays them.
 */
import type { BattleEvent } from '@sim/battle.ts';

export type Cue = 'buy' | 'merge' | 'strike' | 'death' | 'portal' | 'win' | 'loss';

export interface Tone {
  readonly wave: OscillatorType;
  readonly freq: number;
  /** Frequency at the end of the tone, for a slide. */
  readonly slideTo?: number;
  /** Seconds after the cue starts. */
  readonly start: number;
  readonly duration: number;
  readonly gain: number;
}

const SQUARE: OscillatorType = 'square';
const SINE: OscillatorType = 'sine';
const TRIANGLE: OscillatorType = 'triangle';
const SAW: OscillatorType = 'sawtooth';

export const CUE_TONES: Readonly<Record<Cue, readonly Tone[]>> = Object.freeze({
  buy: [
    { wave: SINE, freq: 660, start: 0, duration: 0.07, gain: 0.18 },
    { wave: SINE, freq: 880, start: 0.06, duration: 0.09, gain: 0.18 },
  ],
  merge: [
    { wave: TRIANGLE, freq: 523, start: 0, duration: 0.09, gain: 0.2 },
    { wave: TRIANGLE, freq: 659, start: 0.08, duration: 0.09, gain: 0.2 },
    { wave: TRIANGLE, freq: 784, start: 0.16, duration: 0.18, gain: 0.2 },
  ],
  strike: [{ wave: SQUARE, freq: 220, slideTo: 110, start: 0, duration: 0.09, gain: 0.12 }],
  death: [{ wave: SAW, freq: 180, slideTo: 60, start: 0, duration: 0.25, gain: 0.14 }],
  portal: [{ wave: SINE, freq: 400, slideTo: 900, start: 0, duration: 0.2, gain: 0.12 }],
  win: [
    { wave: TRIANGLE, freq: 523, start: 0, duration: 0.14, gain: 0.22 },
    { wave: TRIANGLE, freq: 659, start: 0.14, duration: 0.14, gain: 0.22 },
    { wave: TRIANGLE, freq: 784, start: 0.28, duration: 0.14, gain: 0.22 },
    { wave: TRIANGLE, freq: 1047, start: 0.42, duration: 0.3, gain: 0.22 },
  ],
  loss: [
    { wave: SAW, freq: 330, start: 0, duration: 0.2, gain: 0.16 },
    { wave: SAW, freq: 262, start: 0.2, duration: 0.2, gain: 0.16 },
    { wave: SAW, freq: 196, start: 0.4, duration: 0.35, gain: 0.16 },
  ],
});

/** Longest run of the same cue allowed in one frame, so a busy tick isn't a wall of noise. */
export const MAX_SAME_CUE_PER_FRAME = 2;

/**
 * Cues for battle events whose animation has started, from `firstIndex` on.
 * An event of tick k starts at clock time k-1. Returns the cues and the index
 * to resume from next frame.
 */
export function cuesForEvents(
  events: readonly BattleEvent[],
  firstIndex: number,
  clock: number,
): { cues: Cue[]; next: number } {
  const cues: Cue[] = [];
  let next = firstIndex;
  const counts = new Map<Cue, number>();
  for (; next < events.length; next++) {
    const event = events[next];
    if (!event || event.tick - 1 >= clock) break;
    const cue: Cue | null =
      event.kind === 'strike'
        ? 'strike'
        : event.kind === 'death'
          ? 'death'
          : event.kind === 'portal'
            ? 'portal'
            : null;
    if (!cue) continue;
    const seen = counts.get(cue) ?? 0;
    if (seen >= MAX_SAME_CUE_PER_FRAME) continue;
    counts.set(cue, seen + 1);
    cues.push(cue);
  }
  return { cues, next };
}

/** The cue for a finished round from the human's side, or null for a draw. */
export function roundCue(winner: 0 | 1 | null, human: 0 | 1): Cue | null {
  if (winner === null) return null;
  return winner === human ? 'win' : 'loss';
}
