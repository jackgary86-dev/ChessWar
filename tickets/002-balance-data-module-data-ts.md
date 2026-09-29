# Balance data module (data.ts)

**Milestone:** M1 Game logic core  
**Labels:** feature, sim

Single source of truth for every balance number (spec §3.2, §3.4).

- Piece stats: cost, tier, HP, ATK, action speed
- Star multipliers (HP 1/1.9/3.5, ATK 1/1.8/3.3) and ability values
- Pool sizes, tier odds per level, XP table, income/interest/streak values, fight limits (26 idle ticks, 220 max)

**Done when:** no balance number appears anywhere else in `src/`.
