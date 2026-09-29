# Bug check: economy and shop invariants

**Milestone:** QA and bug checks  
**Labels:** qa, economy

- [ ] Pool count conserved through buy, sell, reroll, lock and merge (property test)
- [ ] Gold never negative; buy blocked when unaffordable
- [ ] Board never exceeds level; bench never exceeds 8
- [ ] Merges chain correctly and never lose or duplicate a piece
- [ ] Income, interest and streak math matches the spec for 30 rounds
