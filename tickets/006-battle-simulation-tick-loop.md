# Battle simulation tick loop

**Milestone:** M1 Game logic core  
**Labels:** feature, sim

Spec §3.3.

- Build battle units from both boards with star-scaled stats
- Cooldowns with random first action (seeded); shuffled act order per tick
- Strike lowest-HP enemy in range; damage = round(ATK × mult × (1 − armor)), min 1
- On a kill the attacker moves onto the target's square
- Emit an event list (move, strike, heal, death, portal-cross) for the renderer and log

**Done when:** same seed + armies produce an identical event log (test).
