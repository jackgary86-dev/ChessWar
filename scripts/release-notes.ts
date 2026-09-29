/**
 * Print the CHANGELOG.md section for a version (npm run release-notes -- 1.0.0),
 * for use as GitHub Release text. Exits 1 when the version has no section.
 */
import { readFileSync } from 'node:fs';

/** The body of `## [version]` up to the next `## ` heading, trimmed; null when missing. */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.split('\n');
  const heading = (line: string): boolean => line.startsWith('## ');
  const start = lines.findIndex((line) => heading(line) && line.startsWith(`## [${version}]`));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(heading);
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return body === '' ? null : body;
}

/** Strip a leading `v` from a tag: v1.2.3 -> 1.2.3. Returns null unless it is X.Y.Z. */
export function versionFromTag(tag: string): string | null {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tag);
  return match?.[1] ?? null;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const version = process.argv[2] ?? '';
  const section = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version);
  if (!section) {
    console.error(`CHANGELOG.md has no non-empty section for [${version}]`);
    process.exit(1);
  }
  console.log(section);
}
