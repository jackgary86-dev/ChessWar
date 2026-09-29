/**
 * Headless balance runner.
 *
 * Usage: npm run sim -- --games 500 [--seed 1]
 *
 * The AI-vs-AI match loop arrives with ticket 015 (M2). Until then this script
 * only parses its arguments so that `npm run sim` is wired up and CI can call it.
 */
import { parseArgs } from 'node:util';

import { GAME_NAME } from '../src/sim/index.ts';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    games: { type: 'string', default: '500' },
    seed: { type: 'string', default: '1' },
  },
});

const games = Number(values.games);
const seed = Number(values.seed);

if (!Number.isInteger(games) || games <= 0) {
  console.error(`--games must be a positive integer, got "${values.games}"`);
  process.exit(1);
}
if (!Number.isInteger(seed)) {
  console.error(`--seed must be an integer, got "${values.seed}"`);
  process.exit(1);
}

console.log(`${GAME_NAME} balance runner`);
console.log(`games: ${String(games)}  seed: ${String(seed)}`);
console.log('The match loop is not implemented yet (ticket 015).');
