# Shop card names are clipped by the cost badge on narrow screens

**Milestone:** M4 Polish  
**Labels:** bug, ui

At widths around 580px and below, the five shop cards shrink until the round cost badge sits on top of the piece name, so "Pawn" reads as "awn" and "Bishop" as "ishop". Seen in the stacked (phone) layout during prep.

- Give the card footer room for both the badge and the name (wrap to two lines, shrink the badge, or drop the pips onto their own row) below a breakpoint
- Check 390px and 580px widths, with 1★, 2★ and 3★ pip counts
- Keep the tier colour strip and the "Bought" state as they are

**Done when:** every piece name is fully readable on every card at 390px and 580px, and lint, tests and build pass.
