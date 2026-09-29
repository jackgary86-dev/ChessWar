/**
 * Run the battle fuzz test at full size (npm run fuzz [-- <battles>]): every
 * seed is checked for the sim invariants. Prints the first failing seed.
 */
import { fuzz } from '../tests/helpers/fuzz.ts';

const DEFAULT_BATTLES = 10_000;
const arg = Number(process.argv[2] ?? DEFAULT_BATTLES);
const count = Number.isInteger(arg) && arg > 0 ? arg : DEFAULT_BATTLES;
try {
  const longest = fuzz(count);
  console.log(`${String(count)} battles ok, longest fight ${String(longest)} ticks`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
