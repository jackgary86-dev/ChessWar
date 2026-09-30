# HUD: show On Board and the bench above the shop

**Milestone:** M4 Polish  
**Labels:** feature, ui

Swap the two halves of the dock. The `On board X/level` label and the bench row come first, directly under the scoreboard, and the shop header (gold, odds) with its five cards sits below them. The action row (reroll, lock, buy XP, sell, fight) stays at the bottom.

- Reorder the dock children in `src/ui/hud.ts`; no model changes
- Keep tap-to-place, drag-and-drop and the merge / buy feedback working
- Check the phone layout (390px) still fits without the shop pushing the bench off screen

**Done when:** in prep the bench is visibly above the shop on desktop and phone, and lint, tests and build pass.
