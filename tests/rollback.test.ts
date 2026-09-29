import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = join(process.cwd(), 'scripts', 'rollback.sh');

function setup(): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(join(tmpdir(), 'rollback-'));
  for (const d of ['rel', 'src', 'live']) mkdirSync(join(dir, d));
  writeFileSync(join(dir, 'live', 'index.html'), 'current');
  writeFileSync(join(dir, 'src', 'index.html'), 'previous');
  execFileSync('zip', ['-q', join(dir, 'rel', 'chess-war-v0.9.0.zip'), 'index.html'], {
    cwd: join(dir, 'src'),
  });
  return { dir, env: { ...process.env, WEB_ROOT: join(dir, 'live'), RELEASES_DIR: join(dir, 'rel') } };
}

describe('scripts/rollback.sh', () => {
  it('restores the release zip and keeps the replaced site', () => {
    const { dir, env } = setup();
    execFileSync('bash', [script, 'v0.9.0'], { env });
    expect(readFileSync(join(dir, 'live', 'index.html'), 'utf8')).toBe('previous');
    const backup = readdirSync(dir).find((n) => n.startsWith('live.before-rollback-'));
    expect(backup).toBeDefined();
    expect(readFileSync(join(dir, String(backup), 'index.html'), 'utf8')).toBe('current');
  });

  it('changes nothing when the version has no zip or is malformed', () => {
    const { dir, env } = setup();
    expect(spawnSync('bash', [script, '9.9.9'], { env }).status).toBe(1);
    expect(spawnSync('bash', [script, '../x'], { env }).status).toBe(2);
    expect(readFileSync(join(dir, 'live', 'index.html'), 'utf8')).toBe('current');
  });
});
