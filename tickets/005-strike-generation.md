# Strike generation

**Milestone:** M1 Game logic core  
**Labels:** feature, sim

Which enemies a piece can hit from a square.

- Pawn: the 3 squares ahead (side-aware), respecting the wall
- Knight: knight squares
- Bishop / Rook / Queen: along their lines, up to 3 squares, first piece blocks line of sight

**Tests:** range cap of 3; line of sight blocked by friend or foe; wall blocks non-portal strikes.
