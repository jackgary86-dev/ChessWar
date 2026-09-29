/**
 * Release gate checker.
 *
 * Usage: npm run gate -- alpha|beta|launch [--skip-commands]
 *
 * Runs the automated checks for a gate, lists what a person must still confirm,
 * and exits 1 if any automated check fails. It never declares the gate open:
 * that is a person closing the gate issue.
 */
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import {
  ALPHA_COMMANDS,
  ALPHA_MANUAL,
  ALPHA_REQUIRED_FILES,
  BETA_COMMANDS,
  BETA_MANUAL,
  BETA_REQUIRED_FILES,
  BETA_SIM_GAMES,
  LAUNCH_COMMANDS,
  LAUNCH_MANUAL,
  LAUNCH_REQUIRED_FILES,
  checkVersion,
  checkAiMatchFinishes,
  checkBalance,
  checkFiles,
  formatReport,
  gatePasses,
  playBalanceGames,
} from './gate-lib.ts';
import type { CheckResult, GateReport } from './gate-lib.ts';

const AI_SEED = 1;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { 'skip-commands': { type: 'boolean', default: false } },
});

const gate = positionals[0];
if (gate !== 'alpha' && gate !== 'beta' && gate !== 'launch') {
  console.error('Usage: npm run gate -- alpha|beta|launch [--skip-commands]');
  process.exit(1);
}

const isLaunch = gate === 'launch';
const isBeta = gate === 'beta' || isLaunch;
const results: CheckResult[] = [
  ...checkFiles(
    process.cwd(),
    isLaunch ? LAUNCH_REQUIRED_FILES : isBeta ? BETA_REQUIRED_FILES : ALPHA_REQUIRED_FILES,
  ),
  checkAiMatchFinishes(AI_SEED),
];
if (isLaunch) results.push(...checkVersion(process.cwd()));
if (isBeta) results.push(checkBalance(playBalanceGames(BETA_SIM_GAMES)));
if (!values['skip-commands']) {
  for (const check of isLaunch ? LAUNCH_COMMANDS : isBeta ? BETA_COMMANDS : ALPHA_COMMANDS) {
    const run = spawnSync(check.command, check.args, { stdio: 'ignore' });
    const ok = run.status === 0;
    results.push({
      name: check.name,
      ok,
      detail: ok ? 'passed' : `exit ${String(run.status)}`,
    });
  }
}

const report: GateReport = {
  gate,
  results,
  manual: [...(isLaunch ? LAUNCH_MANUAL : isBeta ? BETA_MANUAL : ALPHA_MANUAL)],
};
console.log(formatReport(report));
process.exit(gatePasses(report) ? 0 : 1);
