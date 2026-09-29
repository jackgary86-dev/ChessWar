# Buy, sell, bench and 3-copy merging

**Milestone:** M2 Economy, shop and AI  
**Labels:** feature, economy

- 8-slot bench; buy blocked on a full bench unless the buy completes a merge
- 3 same type + stars → one piece a star higher, kept where a copy stood (board copy preferred); merges chain to 3★
- Sell refunds cost × 3^(stars−1) and returns that many copies to the pool

**Tests:** 3×1★ → 2★; 9×1★ bought in sequence → 3★; full-bench merge buy; merged piece keeps its board square.
