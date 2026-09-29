import { describe, expect, it } from 'vitest';

import {
  ALPHA_COMMANDS,
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
