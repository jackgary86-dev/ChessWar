import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/preview.yml', import.meta.url), 'utf8');

describe('preview workflow', () => {
  it('runs when a PR opens, updates, reopens and closes', () => {
    expect(workflow).toContain('types: [opened, synchronize, reopened, closed]');
  });

  it('deploys on updates and removes on close, never for forks', () => {
    expect(workflow).toContain("github.event.action != 'closed'");
    expect(workflow).toContain("github.event.action == 'closed'");
    expect(workflow.match(/head\.repo\.full_name == github\.repository/g)).toHaveLength(2);
  });

  it('comments one updating link on the PR', () => {
    expect(workflow).toContain('chess-war-preview');
    expect(workflow).toContain('updateComment');
    expect(workflow).toContain('pull-requests: write');
  });

  it('skips cleanly when secrets are missing', () => {
    expect(workflow).toContain('steps.configured.outputs.yes');
  });
});

describe('preview scripts', () => {
  for (const script of ['preview-deploy.sh', 'preview-remove.sh']) {
    it(`${script} is valid bash and rejects a non-numeric PR number`, () => {
      const path = new URL(`../scripts/${script}`, import.meta.url).pathname;
      execFileSync('bash', ['-n', path]);
      const run = spawnSync('bash', [path, '1; rm -rf /'], {
        env: { ...process.env, PREVIEW_HOST: 'h', PREVIEW_USER: 'u', PREVIEW_ROOT: '/r' },
      });
      expect(run.status).toBe(2);
    });
  }

  it('the deploy script refuses to run without a build', () => {
    const path = new URL('../scripts/preview-deploy.sh', import.meta.url).pathname;
    const run = spawnSync('bash', [path, '5'], {
      env: {
        ...process.env,
        PREVIEW_HOST: 'h',
        PREVIEW_USER: 'u',
        PREVIEW_ROOT: '/r',
        PREVIEW_DIST: '/nonexistent',
      },
    });
    expect(run.status).toBe(2);
  });
});
