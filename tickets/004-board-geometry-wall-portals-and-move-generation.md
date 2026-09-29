# Board geometry: wall, portals and move generation

**Milestone:** M1 Game logic core  
**Labels:** feature, sim

Implement spec §3.1 and the movement column of §3.2.

- 16×8 world grid, wall between x=7 and x=8, portal squares (7,2) (7,5) (8,2) (8,5)
- A step across the wall is legal only if it starts or ends on a portal square; sliders check every step
- Knights leap the wall anywhere
- Move generation for Pawn (forward / diagonal-forward by side), Knight, Bishop, Rook, Queen

**Tests:** rook h5→i5 blocked; rook h6 slides through to i6 and beyond; bishop g7→h6→i5 legal; knight g4→i5 legal; pawns only move toward the enemy.
