import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changelogSection, versionFromTag } from '../scripts/release-notes.ts';

const root = new URL('..', import.meta.url).pathname;
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

describe('changelog', () => {
  const sample =
    '# Changelog\n\n## [Unreleased]\n\n- next\n\n## [1.0.0] - 2026-10-01\n\n### Added\n\n- first\n\n## [0.9.0]\n\n- old\n';

  it('extracts one version section', () => {
    expect(changelogSection(sample, '1.0.0')).toBe('### Added\n\n- first');
    expect(changelogSection(sample, 'Unreleased')).toBe('- next');
  });

  it('returns null for a missing or empty section', () => {
    expect(changelogSection(sample, '2.0.0')).toBeNull();
    expect(changelogSection('## [1.0.0]\n\n## [0.9.0]\n- x', '1.0.0')).toBeNull();
  });

  it('the real CHANGELOG.md has an Unreleased section and follows the format', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelogSection(changelog, 'Unreleased')).not.toBeNull();
    expect(changelog).toMatch(/^# Changelog/);
  });
});

describe('tags', () => {
  it('accepts vX.Y.Z only', () => {
    expect(versionFromTag('v1.2.3')).toBe('1.2.3');
    for (const bad of ['1.2.3', 'v1.2', 'v1.2.3-rc1', 'vx.y.z', 'v1.2.3.4', '']) {
      expect(versionFromTag(bad), bad).toBeNull();
    }
  });
});

describe('release workflow', () => {
  const workflow = read('.github/workflows/release.yml');

  it('triggers on version tags and can write releases', () => {
    expect(workflow).toContain("tags: ['v[0-9]+.[0-9]+.[0-9]+']");
    expect(workflow).toContain('contents: write');
  });

  it('checks the tag against package.json, then checks, builds, zips and releases in order', () => {
    const order = [
      'does not match package.json',
      'npm run lint',
      'npm test',
      'npm run build',
      'package-release.sh',
      'release-notes.ts',
      'gh release create',
    ].map((needle) => workflow.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(workflow).toContain('chess-war-v$VERSION.zip');
  });
});

describe('package-release.sh', () => {
  const script = join(root, 'scripts/package-release.sh');

  it('rejects a bad version and a missing build', () => {
    expect(spawnSync('bash', [script, 'v1']).status).toBe(2);
    expect(
      spawnSync('bash', [script, '1.0.0'], { env: { ...process.env, RELEASE_DIST: '/nope' } })
        .status,
    ).toBe(2);
  });

  it('zips the build contents as chess-war-vX.Y.Z.zip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-'));
    try {
      const dist = join(dir, 'dist');
      mkdirSync(join(dist, 'assets'), { recursive: true });
      writeFileSync(join(dist, 'index.html'), '<html></html>');
      writeFileSync(join(dist, 'assets', 'a.js'), '1');
      const out = execFileSync('bash', [script, '1.2.3'], {
        cwd: dir,
        env: { ...process.env, RELEASE_DIST: dist },
      })
        .toString()
        .trim();
      expect(out).toBe('release/chess-war-v1.2.3.zip');
      expect(existsSync(join(dir, out))).toBe(true);
      const listing = execFileSync('unzip', ['-Z1', join(dir, out)])
        .toString()
        .split('\n');
      expect(listing).toContain('index.html');
      expect(listing).toContain('assets/a.js');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
