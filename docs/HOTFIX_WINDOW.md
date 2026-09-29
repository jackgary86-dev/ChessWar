# Post-launch hotfix window

The two weeks after v1.0 goes live. Goal: keep the live game working, ship fixes fast, and end with a list for v1.1.

## Daily (each day of the two weeks)

1. Triage new `bug` issues: reproduce, set one `sev:` label and a milestone (rules in [`TRIAGE.md`](TRIAGE.md)). The weekly pass becomes daily during the window.
2. Blockers do not wait: whoever sees one sets `sev:blocker` and tells the owner at once.
3. Note the day's count of new bugs by severity in the window's tracking issue.

## Deciding: fix forward or roll back

- If the game is unplayable or data is lost and a fix is not quick, roll back per [`ROLLBACK.md`](ROLLBACK.md), then fix.
- Otherwise fix forward with a patch release.

## Patch release (`v1.0.x`)

1. Branch from main, fix the bug with a test that fails without it, PR with `Closes #N`.
2. Bump the patch version in `package.json`, add a `## [1.0.x]` section to `CHANGELOG.md`.
3. `npm run lint`, `npm test`, `npm run build`, `npm run sim -- --games 20` pass.
4. Owner merges, tags `v1.0.x`, and deploys the zip following [`RELEASING.md`](RELEASING.md) (if present) and the deploy steps in the README. Keep the previous zip on the server for rollback.
5. Verify on the live site (checklist in `ROLLBACK.md`), then close the bug.

Only blockers and majors get a patch release; minors and cosmetics are batched into v1.1.

## Retrospective (end of week two)

Open a retrospective issue that lists:

- What broke and how fast it was fixed.
- What the bug checks missed.
- The v1.1 candidates: online play improvements, new pieces, alliances, and anything players asked for repeatedly.

Close the window when the issue is opened and no `sev:blocker` or `sev:major` is open.
