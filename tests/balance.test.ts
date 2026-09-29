import { beforeAll, describe, expect, it } from 'vitest';

import { playMirroredPair, summarize } from '@sim/match.ts';
import type { BalanceSummary, MatchReport } from '@sim/match.ts';

const SEED = 1;
const GAMES = 200;
const PAIR = 2;
const MAX_WIN_RATE = 0.55;
const PERCENT = 100;
const MAX_AVERAGE_ROUNDS = 60;
const SETUP_TIMEOUT_MS = 180_000;

describe('balance smoke test', () => {
  const reports: MatchReport[] = [];
  let result: BalanceSummary;

  beforeAll(() => {
    for (let i = 0; i < GAMES / PAIR; i++) reports.push(...playMirroredPair(SEED + i));
    result = summarize(reports);
  }, SETUP_TIMEOUT_MS);

  it(`neither side wins more than ${String(MAX_WIN_RATE * PERCENT)}% of ${String(GAMES)} mirrored AI games`, () => {
    expect(result.games).toBe(GAMES);
    expect(result.wins[0] / GAMES).toBeLessThanOrEqual(MAX_WIN_RATE);
    expect(result.wins[1] / GAMES).toBeLessThanOrEqual(MAX_WIN_RATE);
  });

  it('every game ends with a winner or mutual destruction, and matches are short', () => {
    expect(result.wins[0] + result.wins[1] + result.draws).toBe(GAMES);
    expect(result.averageRounds).toBeGreaterThan(1);
    expect(result.averageRounds).toBeLessThan(MAX_AVERAGE_ROUNDS);
  });

  it('counts winning-army pieces once per winning game', () => {
    let pieces = 0;
    for (const report of reports) pieces += report.winningArmy.length;
    let counted = 0;
    for (const row of Object.values(result.appearances)) counted += row[1] + row[2] + row[3];
    expect(counted).toBe(pieces);
    expect(result.winningArmies).toBe(GAMES - result.draws);
  });
});
