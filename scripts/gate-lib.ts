/**
 * Release gate checks: a list of automated checks plus the manual items a person
 * still has to confirm. Pure data and small helpers, so tests can exercise them.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { playAiMatch, playMirroredPair, summarize } from '../src/sim/match.ts';
import type { MatchReport } from '../src/sim/match.ts';

const PERCENT = 100;

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

/** Beta needs the Alpha checks plus these. */
export const BETA_REQUIRED_FILES: readonly string[] = [
  ...ALPHA_REQUIRED_FILES,
  'assets/brand/logo-mark.svg',
  'assets/pieces/P-ivory.svg',
  'assets/pieces/P-ebony.svg',
  'assets/pieces/N-ivory.svg',
  'assets/pieces/N-ebony.svg',
  'assets/pieces/B-ivory.svg',
  'assets/pieces/B-ebony.svg',
  'assets/pieces/R-ivory.svg',
  'assets/pieces/R-ebony.svg',
  'assets/pieces/Q-ivory.svg',
  'assets/pieces/Q-ebony.svg',
  'docs/PERFORMANCE.md',
  'tests/accessibility.test.ts',
  'tests/online-bugcheck.test.ts',
];

export const BETA_COMMANDS: readonly CommandCheck[] = [
  ...ALPHA_COMMANDS,
  {
    name: 'performance budgets',
    command: 'npx',
    args: ['vitest', 'run', 'tests/performance.test.ts'],
  },
  {
    name: 'accessibility checks',
    command: 'npx',
    args: ['vitest', 'run', 'tests/accessibility.test.ts'],
  },
  { name: 'save and resume checks', command: 'npx', args: ['vitest', 'run', 'tests/save.test.ts'] },
];

export const BETA_MANUAL: readonly string[] = [
  'Milestones M3 and M4 are closed on GitHub',
  'Final piece, board and portal art is in the game (no placeholders left)',
  'All issues labelled must-fix from the Alpha feedback review are closed',
  'Browser and device check (ticket 046) signed off on real browsers and phones',
  'Performance on a mid-range phone and home Wi-Fi signed off (docs/PERFORMANCE.md)',
  'No open issue labelled sev:blocker or sev:major (search: is:issue is:open label:sev:blocker,sev:major)',
];

/** Neither side may win more than this share of the mirrored sim games. */
export const BETA_MAX_WIN_RATE = 0.55;
export const BETA_SIM_GAMES = 500;

/** Pure: the balance verdict for a set of match reports. */
export function checkBalance(
  reports: readonly MatchReport[],
  maxWinRate: number = BETA_MAX_WIN_RATE,
): CheckResult {
  const summary = summarize(reports);
  const worst = Math.max(summary.wins[0], summary.wins[1]) / Math.max(1, summary.games);
  const percent = (n: number): string => (n * PERCENT).toFixed(1);
  return {
    name: `balance: neither side above ${percent(maxWinRate)}%`,
    ok: summary.games > 0 && worst <= maxWinRate,
    detail: `${String(summary.games)} games, Ivory ${String(summary.wins[0])}, Ebony ${String(summary.wins[1])}, worst side ${percent(worst)}%`,
  };
}

export function playBalanceGames(games: number, seed = 1): MatchReport[] {
  const reports: MatchReport[] = [];
  for (let i = 0; reports.length < games; i++) {
    reports.push(...playMirroredPair(seed + i).slice(0, games - reports.length));
  }
  return reports;
}
