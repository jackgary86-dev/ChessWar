import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('bug report template', () => {
  const template = read('.github/ISSUE_TEMPLATE/bug_report.yml');

  it('asks for everything the ticket lists', () => {
    for (const id of [
      'steps',
      'expected',
      'actual',
      'seed-round',
      'device',
      'browser',
      'screenshot',
    ]) {
      expect(template, id).toContain(`id: ${id}`);
    }
  });

  it('requires the fields a maintainer cannot work without', () => {
    for (const id of ['steps', 'expected', 'actual', 'device', 'browser']) {
      const block = template.slice(template.indexOf(`id: ${id}`));
      const next = block.indexOf('  - type:', 1);
      expect(block.slice(0, next === -1 ? undefined : next), id).toContain('required: true');
    }
  });

  it('labels new reports as bugs', () => {
    expect(template).toContain("labels: ['bug']");
  });
});

describe('severity labels and triage', () => {
  const labels = read('.github/labels.yml');
  const triage = read('docs/TRIAGE.md');

  it('defines the four severity labels', () => {
    for (const name of ['sev:blocker', 'sev:major', 'sev:minor', 'sev:cosmetic']) {
      expect(labels).toContain(`name: ${name}`);
      expect(triage).toContain(`\`${name}\``);
    }
  });

  it('describes the weekly triage and the milestone rule', () => {
    expect(triage).toContain('Weekly triage');
    expect(triage).toContain('milestone');
  });
});
