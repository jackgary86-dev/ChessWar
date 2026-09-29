# Bug check: battle simulation fuzz test

**Milestone:** QA and bug checks  
**Labels:** qa, sim

Run 10,000 random armies through the sim (seeded).

- [ ] Every battle ends within 220 ticks
- [ ] No piece ever stands on another piece or outside the grid
- [ ] No non-knight crosses the wall except via a portal square
- [ ] HP never above max or below 0; heals never exceed max
- [ ] Same seed replays identically

File a bug for each failure with its seed.
