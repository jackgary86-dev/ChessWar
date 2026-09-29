# Bug triage

How a bug goes from report to fix. Reports come in through the bug report form (`.github/ISSUE_TEMPLATE/bug_report.yml`), which asks for steps to reproduce, expected versus actual, seed and round, device and browser, and a screenshot.

## Severity labels

Every bug gets exactly one severity. Definitions are in [`.github/labels.yml`](../.github/labels.yml).

| Label | Meaning | Examples | Target |
|---|---|---|---|
| `sev:blocker` | Cannot play, data loss, or a crash with no workaround | Game will not start; a save is wiped; a fight never ends | Fix now; blocks any release |
| `sev:major` | A main feature is broken, or a common bug with a poor workaround | Shop will not sell; wrong damage dealt; hot-seat shows the other player's board | Fix before the next milestone closes |
| `sev:minor` | Wrong but playable, or rare, with an easy workaround | Tooltip shows a stale number; a rare pathing oddity | Fix when convenient, batch with other work |
| `sev:cosmetic` | Looks or reads wrong, no effect on play | Misaligned pip; typo | Backlog |

When unsure between two, pick the higher one and note why.

## Weekly triage

Once a week the maintainer goes through every open issue labelled `bug` that has no severity label (filter: `is:issue is:open label:bug -label:sev:blocker -label:sev:major -label:sev:minor -label:sev:cosmetic`).

For each one:

1. **Reproduce** using the steps. If it cannot be reproduced, ask for what is missing (browser, seed, screenshot) and add `needs-triage` until the reporter answers; close it after two weeks of silence.
2. **Set a severity** label.
3. **Set a milestone**: the current one for blockers and majors, the next one for minors, and the backlog milestone for cosmetics.
4. **Deduplicate**: close copies with a link to the original.
5. Remove `needs-triage` once both severity and milestone are set. A bug is triaged only when it has both.

Blockers do not wait for the weekly pass: whoever sees one sets the label and tells the owner straight away.

## Fixing

A fix links its bug (`Closes #N`) and adds a test that fails without the fix, where the bug is in code that can be tested. Say in the pull request which severity label it clears.
