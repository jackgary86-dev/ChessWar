# Seeded RNG

**Milestone:** M1 Game logic core  
**Labels:** feature, sim

Deterministic RNG (e.g. mulberry32) carried in game state. No `Math.random` inside `src/sim`.

- `next()`, `int(n)`, `shuffle(arr)`
- Serializable state so a match can be saved and resumed

**Done when:** same seed gives the same sequence; tested.
