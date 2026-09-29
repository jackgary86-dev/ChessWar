# Online 1v1: authoritative WebSocket server

**Milestone:** M5 Online  
**Labels:** feature, net

Small Node + WebSocket server that owns the RNG seed, pool and battle sim using the shared `src/sim` code unchanged.

- Clients send intents only: buy, sell, reroll, lock, buyXP, place, ready
- Server validates every intent and never trusts client state
- Server sends state updates and the battle event list
