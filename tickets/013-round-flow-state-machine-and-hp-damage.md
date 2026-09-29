# Round flow state machine and HP damage

**Milestone:** M2 Economy, shop and AI  
**Labels:** feature, sim

`prep → handoff → combat → result → next round | game over` (spec §3.5).

- Player HP 50; loser takes 2 + surviving winner stars + floor(round/4); draw costs both 2
- Supports vs-AI and local 2-player modes

**Done when:** a full match can be played headlessly through the state machine.
