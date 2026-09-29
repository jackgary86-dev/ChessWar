import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(new URL(`../assets/brand/${name}`, import.meta.url), 'utf8');

describe('brand assets', () => {
  it('ships a square mark and a wordmark, each with an accessible name', () => {
    const mark = read('logo-mark.svg');
    expect(mark).toContain('viewBox="0 0 64 64"');
    expect(mark).toMatch(/aria-label="Chess War mark"/);
    const word = read('logo-wordmark.svg');
    expect(word).toContain('viewBox="0 0 320 64"');
    expect(word).toMatch(/aria-label="Chess War"/);
    expect(word).toContain('CHESS');
    expect(word).toContain('WAR');
  });

  it('uses only style-guide colors', () => {
    const allowed = new Set([
      '#1e1b15',
      '#d3a64d',
      '#dccca5',
      '#9c805a',
      '#76826c',
      '#c0c6b3',
      '#0b0a08',
      '#a47fff',
      '#ede5d1',
    ]);
    for (const name of ['logo-mark.svg', 'logo-wordmark.svg']) {
      for (const color of read(name).match(/#[0-9a-f]{6}/gi) ?? []) {
        expect(allowed.has(color.toLowerCase()), `${name} ${color}`).toBe(true);
      }
    }
  });
});
