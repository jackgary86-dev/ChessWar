# Save and resume a match

**Milestone:** M4 Polish  
**Labels:** feature

Save the full game state (including RNG state) to localStorage at the start of each prep phase. Offer Continue on the start screen. Wrap every storage call in try/catch and play normally if storage is unavailable.
