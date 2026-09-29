import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = new URL('../assets/icons/', import.meta.url);
const REQUIRED = [
  'gold',
  'xp',
  'hp',
  'reroll',
  'lock',
  'sell',
  'sound-on',
  'sound-off',
  'settings',
];

describe('icon set', () => {
  it('has every icon the ticket names', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
    for (const name of REQUIRED) expect(files).toContain(`${name}.svg`);
  });

  it('draws every icon on the shared 24 px grid in currentColor with an accessible name', () => {
    for (const name of REQUIRED) {
      const svg = readFileSync(new URL(`${name}.svg`, DIR), 'utf8');
      expect(svg, name).toContain('viewBox="0 0 24 24"');
      expect(svg, name).toContain('stroke="currentColor"');
      expect(svg, name).toMatch(/aria-label="[^"]+"/);
      expect(svg, name).toMatch(/<title>[^<]+<\/title>/);
      expect(svg, name).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
  });
});
