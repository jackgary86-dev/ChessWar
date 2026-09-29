/**
 * Release gate checker.
 *
 * Usage: npm run gate -- alpha [--skip-commands]
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
  checkAiMatchFinishes,
  checkFiles,
  formatReport,
  gatePasses,
} from './gate-lib.ts';
import type { CheckResult, GateReport } from './gate-lib.ts';

const AI_SEED = 1;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { 'skip-commands': { type: 'boolean', default: false } },
});

const gate = positionals[0];
if (gate !== 'alpha') {
  console.error('Usage: npm run gate -- alpha [--skip-commands]');
  process.exit(1);
}

const results: CheckResult[] = [
  ...checkFiles(process.cwd(), ALPHA_REQUIRED_FILES),
  checkAiMatchFinishes(AI_SEED),
];
if (!values['skip-commands']) {
  for (const check of ALPHA_COMMANDS) {
    const run = spawnSync(check.command, check.args, { stdio: 'ignore' });
    const ok = run.status === 0;
    results.push({
      name: check.name,
      ok,
      detail: ok ? 'passed' : `exit ${String(run.status)}`,
    });
  }
}

const report: GateReport = { gate, results, manual: [...ALPHA_MANUAL] };
console.log(formatReport(report));
process.exit(gatePasses(report) ? 0 : 1);
