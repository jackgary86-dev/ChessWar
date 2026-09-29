/**
 * Headless balance runner.
 *
 * Usage: npm run sim -- --games 500 [--seed 1] [--difficulty normal]
 *
 * Plays AI-vs-AI matches (each seed twice with the prep order swapped, so an odd
 * --games plays one extra half pair) and prints win rate by side, average match
 * length and how often each piece and star level appears in winning armies.
 */
import { parseArgs } from 'node:util';

import { AI_DIFFICULTY, PIECE_ORDER, PIECES } from '../src/sim/data.ts';
import type { AiDifficulty } from '../src/sim/data.ts';
import { playMirroredPair, summarize } from '../src/sim/match.ts';
import type { MatchReport } from '../src/sim/match.ts';

const PERCENT = 100;
const TARGET_MAX_WIN_RATE = 0.55;
const TARGET_MAX_WIN_PERCENT = TARGET_MAX_WIN_RATE * PERCENT;

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    games: { type: 'string', default: '500' },
    seed: { type: 'string', default: '1' },
    difficulty: { type: 'string', default: 'normal' },
  },
});

const games = Number(values.games);
const seed = Number(values.seed);
const difficulty = values.difficulty;

if (!Number.isInteger(games) || games <= 0) {
  console.error(`--games must be a positive integer, got "${values.games}"`);
  process.exit(1);
}
if (!Number.isInteger(seed)) {
  console.error(`--seed must be an integer, got "${values.seed}"`);
  process.exit(1);
}
if (!(difficulty in AI_DIFFICULTY)) {
  console.error(`--difficulty must be one of ${Object.keys(AI_DIFFICULTY).join(', ')}`);
  process.exit(1);
}

const reports: MatchReport[] = [];
for (let i = 0; reports.length < games; i++) {
  const pair = playMirroredPair(seed + i, difficulty as AiDifficulty);
  reports.push(...pair.slice(0, games - reports.length));
}

const summary = summarize(reports);
const pct = (n: number): string => `${((n / summary.games) * PERCENT).toFixed(1)}%`;

console.log('Chess War balance runner');
console.log(`games: ${String(summary.games)}  seed: ${String(seed)}  ai: ${difficulty}`);
console.log('');
console.log('Win rate by side');
console.log(`  Ivory (left):  ${String(summary.wins[0])}  ${pct(summary.wins[0])}`);
console.log(`  Ebony (right): ${String(summary.wins[1])}  ${pct(summary.wins[1])}`);
console.log(`  No winner:     ${String(summary.draws)}  ${pct(summary.draws)}`);
const worst = Math.max(summary.wins[0], summary.wins[1]) / summary.games;
console.log(
  `  target: neither side above ${TARGET_MAX_WIN_PERCENT.toFixed(0)}% -> ${worst > TARGET_MAX_WIN_RATE ? 'OUT OF RANGE' : 'ok'}`,
);
console.log('');
console.log(`Average match length: ${summary.averageRounds.toFixed(1)} rounds`);
console.log('');
console.log(`Pieces in winning armies (deciding fight, ${String(summary.winningArmies)} armies)`);
console.log('  piece    1*     2*     3*   per army');
for (const type of PIECE_ORDER) {
  const row = summary.appearances[type];
  const total = row[1] + row[2] + row[3];
  const perArmy = summary.winningArmies === 0 ? 0 : total / summary.winningArmies;
  console.log(
    `  ${PIECES[type].name.padEnd(7)} ${String(row[1]).padStart(5)} ${String(row[2]).padStart(6)} ${String(row[3]).padStart(6)}   ${perArmy.toFixed(2)}`,
  );
}
