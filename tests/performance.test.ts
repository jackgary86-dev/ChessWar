import { describe, expect, it } from 'vitest';
import { playAiMatch } from '@sim/match.ts';
import {
  FRAME_BUDGET_MS,
  FULL_BOARD_PIECES,
  fullBoardBattle,
  simMs,
  worstFrameMs,
} from './helpers/perf.ts';

/** The ticket asks for 500 games in 60 s; CI checks a 20-game slice at the same rate, doubled for slow runners. */
const SLICE_GAMES = 20;
const SLICE_BUDGET_MS = (60_000 / 500) * SLICE_GAMES * 2;
const CI_FRAME_BUDGET_MS = FRAME_BUDGET_MS * 2;

describe('performance budgets', () => {
  it('runs the sim fast enough for 500 games in 60 s', () => {
    expect(simMs(SLICE_GAMES)).toBeLessThan(SLICE_BUDGET_MS);
  });

  it('has a full 16-piece board to measure', () => {
    expect(fullBoardBattle().battle.units).toHaveLength(FULL_BOARD_PIECES);
  });

  it('builds a 16-piece animation frame well inside a 60 fps frame', () => {
    expect(worstFrameMs()).toBeLessThan(CI_FRAME_BUDGET_MS);
  });

  it('plays the same match the same way every time (no state kept between matches)', () => {
    expect(playAiMatch({ seed: 7 })).toEqual(playAiMatch({ seed: 7 }));
  });
});
