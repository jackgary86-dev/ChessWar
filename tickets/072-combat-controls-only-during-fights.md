# Show the combat controls only during a fight

**Milestone:** M4 Polish  
**Labels:** feature, ui

The row with `1× 2× 4×`, `Skip to result` and `Sound on/off` is visible on the start screen and all through prep, where none of it does anything. Hide the whole row unless a fight is playing.

- Toggle the `.controls` row from the same refresh that shows and hides overlays; it appears when combat playback starts and disappears when the result is shown
- Prep, handoff, start, result and game-over screens show no combat controls
- The sound preference still persists; the toggle is simply only reachable while a fight plays

**Done when:** the row is absent on the start screen and during prep, present during combat, and lint, tests and build pass.
