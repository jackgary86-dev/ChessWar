# Pathfinding: BFS on each piece's own move graph

**Milestone:** M1 Game logic core  
**Labels:** feature, sim

When no enemy is in range, move along the shortest path (in the piece's own chess moves, current occupancy) to the nearest square it could strike from.

- Fallback: legal move that most reduces wall-aware king-step distance to the nearest enemy
- Otherwise wait 1 tick

**Tests:** a rook routes through a portal row; a bishop crosses via a portal diagonal; a blocked pawn waits.
