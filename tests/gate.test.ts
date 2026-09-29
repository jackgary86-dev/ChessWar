import { describe, expect, it } from 'vitest';

import { playMirroredPair } from '@sim/match.ts';
import {
  ALPHA_COMMANDS,
  BETA_COMMANDS,
  BETA_MANUAL,
  BETA_REQUIRED_FILES,
  checkBalance,
  playBalanceGames,
  ALPHA_MANUAL,
  ALPHA_REQUIRED_FILES,
  checkAiMatchFinishes,
  checkFiles,
  formatReport,
  gatePasses,
} from '../scripts/gate-lib.ts';

describe('alpha gate checker', () => {
  it('finds every required file in this repository', () => {
    const results = checkFiles(process.cwd(), ALPHA_REQUIRED_FILES);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });

  it('reports a missing file as a failure', () => {
    const [result] = checkFiles(process.cwd(), ['docs/does-not-exist.md']);
    expect(result?.ok).toBe(false);
  });

  it('finishes a full vs-AI match', () => {
    expect(checkAiMatchFinishes(1).ok).toBe(true);
  });

  it('runs lint, tests and build, and lists the manual items from the ticket', () => {
    expect(ALPHA_COMMANDS.map((c) => c.name)).toEqual(
      expect.arrayContaining(['lint', 'unit tests', 'build']),
    );
    expect(ALPHA_MANUAL.some((m) => m.includes('sev:blocker'))).toBe(true);
    expect(ALPHA_MANUAL.some((m) => m.includes('staging'))).toBe(true);
  });

  it('never passes when a check fails, and always lists the manual items', () => {
    const report = {
      gate: 'alpha',
      results: [{ name: 'x', ok: false, detail: 'missing' }],
      manual: ['Sign off'],
    };
    expect(gatePasses(report)).toBe(false);
    const text = formatReport(report);
    expect(text).toContain('[FAIL] x');
    expect(text).toContain('[ ] Sign off');
    expect(text).toContain('not open');
  });
});

describe('beta gate checker', () => {
  it('requires everything Alpha does, plus the final art', () => {
    expect(BETA_REQUIRED_FILES).toEqual(expect.arrayContaining([...ALPHA_REQUIRED_FILES]));
    const art = BETA_REQUIRED_FILES.filter((f) => f.startsWith('assets/'));
    expect(checkFiles(process.cwd(), art).filter((r) => !r.ok)).toEqual([]);
  });

  it('adds performance, accessibility and save checks to the alpha commands', () => {
    const names = BETA_COMMANDS.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['lint', 'performance budgets', 'accessibility checks']),
    );
    expect(BETA_MANUAL.some((m) => m.includes('sev:major'))).toBe(true);
  });

  it('passes a balanced set of games and fails a lopsided one', () => {
    const balanced = playBalanceGames(20);
    expect(balanced).toHaveLength(20);
    expect(checkBalance(balanced, 1).ok).toBe(true);
    const win = balanced.find((r) => r.winner === 0);
    if (!win) throw new Error('expected an Ivory win in 20 games');
    const lopsided = Array.from({ length: 10 }, () => ({ ...win }));
    expect(checkBalance(lopsided).ok).toBe(false);
  });

  it('plays mirrored pairs so each seed is seated both ways', () => {
    expect(playMirroredPair(1)).toHaveLength(2);
  });
});
