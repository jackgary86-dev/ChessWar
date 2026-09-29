/**
 * Release gate checks: a list of automated checks plus the manual items a person
 * still has to confirm. Pure data and small helpers, so tests can exercise them.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { playAiMatch } from '../src/sim/match.ts';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface GateReport {
  gate: string;
  results: CheckResult[];
  manual: string[];
}

export interface CommandCheck {
  name: string;
  command: string;
  args: string[];
}

/** Files that must exist on main for the Alpha gate. */
export const ALPHA_REQUIRED_FILES: readonly string[] = [
  'docs/art/STYLE_GUIDE.md',
  'docs/TRIAGE.md',
  'tests/battle-fuzz.test.ts',
  'tests/economy-invariants.test.ts',
  'tests/hotseat-flow.test.ts',
  'tests/save.test.ts',
];

/** Commands that must exit 0 for the Alpha gate. */
export const ALPHA_COMMANDS: readonly CommandCheck[] = [
  { name: 'lint', command: 'npm', args: ['run', 'lint'] },
  { name: 'unit tests', command: 'npm', args: ['test'] },
  { name: 'build', command: 'npm', args: ['run', 'build'] },
  {
    name: 'hot-seat full match and round flow',
    command: 'npx',
    args: ['vitest', 'run', 'tests/hotseat-flow.test.ts'],
  },
];

/** What only a person can confirm; taken from the ticket's checklist. */
export const ALPHA_MANUAL: readonly string[] = [
  'Milestones M1 and M2 are closed on GitHub',
  'M3 UI is playable end to end in a browser (vs AI and hot-seat)',
  'No open issue labelled sev:blocker (search: is:issue is:open label:sev:blocker)',
  'The build is deployed to staging and loads',
];

export function checkFiles(root: string, files: readonly string[]): CheckResult[] {
  return files.map((file) => {
    const ok = existsSync(join(root, file));
    return { name: `file ${file}`, ok, detail: ok ? 'present' : 'missing' };
  });
}

/** A full AI-vs-AI match must reach a winner (or mutual destruction) before the round cap. */
export function checkAiMatchFinishes(seed: number): CheckResult {
  const report = playAiMatch({ seed });
  const ok = report.rounds > 0;
  return {
    name: 'vs AI: a full match finishes',
    ok,
    detail: `seed ${String(seed)}: winner ${report.winner === null ? 'none' : String(report.winner)} after ${String(report.rounds)} rounds`,
  };
}

export function formatReport(report: GateReport): string {
  const lines = [`Gate: ${report.gate}`, '', 'Automated'];
  for (const r of report.results) {
    lines.push(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}: ${r.detail}`);
  }
  lines.push('', 'Needs a person');
  for (const item of report.manual) lines.push(`  [ ] ${item}`);
  const failed = report.results.filter((r) => !r.ok).length;
  lines.push(
    '',
    failed === 0
      ? 'Automated checks pass. Tick the manual items, then close the gate issue.'
      : `${String(failed)} automated check(s) failed. The gate is not open.`,
  );
  return lines.join('\n');
}

export function gatePasses(report: GateReport): boolean {
  return report.results.every((r) => r.ok);
}
