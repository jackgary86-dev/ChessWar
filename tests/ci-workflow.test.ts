import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('CI build artifact', () => {
  it('runs on every push and pull request, so main and PRs both upload dist', () => {
    expect(workflow).toMatch(/push:\s*\n\s*branches: \['\*\*'\]/);
    expect(workflow).toContain('pull_request:');
  });

  it('uploads dist/ named with the commit SHA (the PR head SHA on pull requests)', () => {
    expect(workflow).toContain('path: dist');
    expect(workflow).toContain(
      'name: chess-war-dist-${{ github.event.pull_request.head.sha || github.sha }}',
    );
  });

  it('keeps it for 14 days and fails when dist/ is missing', () => {
    expect(workflow).toContain('retention-days: 14');
    expect(workflow).toContain('if-no-files-found: error');
  });

  it('builds before it uploads', () => {
    expect(workflow.indexOf('npm run build')).toBeLessThan(workflow.indexOf('upload-artifact'));
  });
});
