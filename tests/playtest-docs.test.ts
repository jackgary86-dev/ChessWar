import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RESULTS = readFileSync('docs/playtest/alpha-results.md', 'utf8');
const AI_MATCHES = 5;
const HOT_SEAT_MATCHES = 5;

function rowsFor(mode: string): string[] {
  return RESULTS.split('\n').filter((line) => new RegExp(`^\\| \\d+ \\| ${mode} \\|`).test(line));
}

describe('alpha playtest sheet', () => {
  it('has 5 vs-AI and 5 hot-seat rows', () => {
    expect(rowsFor('vs AI')).toHaveLength(AI_MATCHES);
    expect(rowsFor('Hot-seat')).toHaveLength(HOT_SEAT_MATCHES);
  });

  it('asks for the fields the ticket names', () => {
    for (const field of ['Rounds', 'Minutes', 'Most-used piece', 'Least-used piece', 'Confusing']) {
      expect(RESULTS).toContain(field);
    }
  });
});
