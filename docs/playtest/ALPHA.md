# Alpha playtest: 10 internal matches

Nixon and Connor play 10 matches on staging: 5 vs AI and 5 hot-seat. Fill in `alpha-results.md` after each match. This page is the instructions.

## Before you start

1. Confirm the staging build loads (`npm run gate -- alpha` covers the automated side; the staging deploy is a manual check).
2. Note the build: the commit SHA shown in the CI artifact name (`chess-war-dist-<sha>`) or `git log -1`.
3. Use a fresh browser profile or clear site data so saves from earlier runs do not interfere.

## Matches

| # | Mode | Who |
|---|---|---|
| 1–5 | Play vs AI | Alternate players; use the difficulty default |
| 6–10 | 2 players on one screen (hot-seat) | Both together, passing the device at the handoff screen |

Play each match to the end. Do not skip fights unless the match is clearly decided.

## What to record per match (one row in `alpha-results.md`)

- **Mode** and **build** (SHA).
- **Seed** if you can see it (needed to reproduce a bug); otherwise the round where it happened.
- **Match length**: rounds played, and wall-clock minutes.
- **Winner** and final HP.
- **Most-used piece** and **least-used piece** across your buys.
- **Confusing moments**: anything you had to ask about, guess at, or misread.

## Filing bugs

Use the bug report form (`.github/ISSUE_TEMPLATE/bug_report.yml`) and set severity per `docs/TRIAGE.md`. Put the seed, round and match number in the report and link it from the results row.

## After the last match

Fill in the summary block at the bottom of `alpha-results.md` (average length, favourite and least-used piece overall, list of confusing moments), then hand over to the feedback review (ticket 060).
