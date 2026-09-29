# Balance pass 2 procedure

Run after Beta, using Beta feedback and `npm run sim` results. All balance numbers live in `src/sim/data.ts`; change nothing else and add no mechanics beyond the spec.

## Steps

1. **Baseline.** On main, run `npm run sim -- --games 500` and save the output (per-piece pick, win and survival figures, side win rates) in the pass's issue or PR.
2. **Collect Beta signal.** List what players said: pieces that felt too strong or weak, rounds that felt too long or short, economy complaints. Use `docs/playtest/` sheets and `bug`/`balance` issues. Ignore anything that is a bug rather than a number; file it instead.
3. **Match signal to data.** Only act when the sim agrees with at least one piece of Beta feedback, or a sim limit is missed (neither side above 55% over 500 games; no piece dominating pick or win rate). Feedback alone is a hypothesis.
4. **Change little.** One or two constants per pass in `src/sim/data.ts` (cost, HP, attack, speed, odds, XP). Keep each change small and record old and new values with the reason.
5. **Re-measure.** Run `npm run sim -- --games 500` again and compare with the baseline. Repeat steps 4 and 5 until the limits hold.
6. **Re-run the bug checks** for the sim and economy: `npm test` (including the fuzz and economy invariant tests), `npm run fuzz`, `npm run lint`, `npm run build`.
7. **Prototype sync.** If the prototype's data block drifts from `data.ts`, update `prototype/chess-war.html` and its rules version comment (see the prototype sync ticket).
8. **Open the PR** with a table of changes (constant, old, new, reason) and before/after sim numbers. Update `CHANGELOG.md`.

## Done when

- Sim limits hold over 500 games after the change.
- Sim and economy bug checks pass.
- The PR lists every changed number with a reason, and the owner has approved it.
