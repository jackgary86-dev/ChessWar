# Fight end conditions and material tiebreak

**Milestone:** M1 Game logic core  
**Labels:** feature, sim

- Ends when one side has no pieces
- Ends after 26 ticks with no damage, or at 220 ticks: winner by remaining material Σ cost × 3^(stars−1) × hp/maxHp; exact tie is a draw

**Tests:** every random battle in a 1,000-battle fuzz ends within 220 ticks.
