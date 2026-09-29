# Shared piece pool and shop rolling

**Milestone:** M2 Economy, shop and AI  
**Labels:** feature, economy

Spec §3.4.

- Pool shared by both players: Pawn 30, Knight 18, Bishop 18, Rook 14, Queen 9
- 5-slot shop rolled with tier odds by level; empty tier falls back to the nearest tier with stock
- Reroll (2g) returns unbought cards to the pool; free roll each round unless locked; lock lasts one round

**Test:** total piece count (pool + shops + benches + boards) is conserved across buy/sell/reroll.
