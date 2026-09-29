# Alpha feedback review

Template. Fill it in after the Alpha playtest (ten internal matches, see the results sheet from the Alpha playtest ticket). Every piece of feedback lands in exactly one table below.

## How to use

1. Collect all feedback: the results sheet (confusing moments, bugs filed), open `bug` issues, and anything said in chat. One line per distinct item; merge duplicates and keep every source.
2. Sort each item into a table:
   - **Must-fix for Beta**: the game is broken, unfair, or confusing enough that outside players would quit (`sev:blocker` or `sev:major` bugs, rules that players misread, matches that stall). Each row needs an issue. Link the existing one, or create it and label it with a severity and the Beta milestone.
   - **Nice-to-have**: real but not blocking. Add an issue or leave in the backlog milestone.
   - **Won't-fix**: out of scope for the spec, working as designed, or not reproducible. Every row needs a reason, and the reporter should hear it.
3. Balance feedback ("queens are too strong") goes in a table only after checking `npm run sim -- --games 500`; real balance changes wait for the balance passes and are not Beta must-fix by default.
4. Do not add mechanics beyond the spec (`docs/CODER_PROMPT.md`). A feature request is nice-to-have or won't-fix.
5. When every must-fix row has an issue in the Beta milestone, the review is done. Say so on the Alpha review ticket.

Severity definitions are in [`../TRIAGE.md`](../TRIAGE.md).

## Must-fix for Beta

| # | Feedback | Source (match / person) | Issue | Severity | Owner |
|---|---|---|---|---|---|
| | | | | | |

## Nice-to-have

| # | Feedback | Source (match / person) | Issue or backlog note | Owner |
|---|---|---|---|---|
| | | | | |

## Won't-fix

| # | Feedback | Source (match / person) | Reason | Reporter told? |
|---|---|---|---|---|
| | | | | |

## Summary

- Matches played / feedback items collected:
- Must-fix / nice-to-have / won't-fix counts:
- Reviewed by, date:
