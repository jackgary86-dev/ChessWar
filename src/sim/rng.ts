/**
 * Seeded RNG (mulberry32). Deterministic and serializable: the whole generator
 * is one 32-bit integer, so a match can be saved and resumed mid-stream.
 *
 * The RNG state is a plain object so it can live inside game state and be
 * JSON-serialized. Functions mutate it in place.
 */

/** Serializable generator state. */
export interface Rng {
  /** Current 32-bit unsigned state. */
  state: number;
}

const GOLDEN_GAMMA = 0x6d2b79f5;
const XORSHIFT_A = 15;
const XORSHIFT_B = 7;
const XORSHIFT_C = 61;
const XORSHIFT_D = 14;
const FLOAT_DIVISOR = 4294967296;

/** Create a generator from any integer seed. */
export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Restore a generator from previously serialized state. */
export function restoreRng(saved: Rng): Rng {
  return { state: saved.state >>> 0 };
}

/** Next float in [0, 1). */
export function next(rng: Rng): number {
  rng.state = (rng.state + GOLDEN_GAMMA) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> XORSHIFT_A), t | 1);
  t ^= t + Math.imul(t ^ (t >>> XORSHIFT_B), t | XORSHIFT_C);
  return ((t ^ (t >>> XORSHIFT_D)) >>> 0) / FLOAT_DIVISOR;
}

/** Integer in [0, n). `n` must be a positive integer. */
export function int(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`int(n) needs a positive integer, got ${String(n)}`);
  }
  return Math.floor(next(rng) * n);
}

/** Fisher-Yates shuffle. Returns a new array; the input is left untouched. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
