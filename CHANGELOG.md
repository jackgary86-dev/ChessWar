# Changelog

All notable changes to Chess War. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Releases are tagged `vX.Y.Z`; see `docs/RELEASING.md`.

## [Unreleased]

## [1.0.0]

First public release. **Draft: the date and final wording are for the owner to confirm before tagging.**

### Added

- Chess War: an auto-battler played with chess pieces on two 8×8 boards split by a wall and linked by portal squares. Buy, merge (3 copies to a star), place and watch armies fight automatically.
- Game logic core: board with wall and portals, piece movement and strikes, tick-based battle simulation, star abilities (Shield Wall, Fork, Blessing, Fortress, Pierce) and fight end rules with a material tiebreak.
- Economy and rounds: shared piece pool, shop and rerolls, income, interest, streaks, XP and levels, HP damage and the round state machine.
- AI opponent, and a headless balance runner (`npm run sim`).
- Canvas UI: combat animation and speed controls, HUD, tap and drag placement, hot-seat privacy screens, battle log in chess notation, field manual, save and resume, sound with mute.
- Online 1v1 over WebSockets: room codes, ready-up, reconnect and forfeit.
- Art: piece sprites, star-level visuals, board tiles, wall and portals, combat and merge effects, shop cards, UI kit, logo, title screen, favicon and app icons.
- Accessibility: keyboard board cursor and a global focus ring.
- Playable demo (`?demo`) with first-round hints.
- Tooling: CI with lint, tests, build and sim; balance data in `src/sim/data.ts`; bug report template and triage process.

### Fixed

- Unusable save files are discarded with a message instead of breaking the game.

### Quality

- Battle-simulation fuzz test, economy and shop invariants under random play, hot-seat privacy and round-flow checks, save/resume and storage-failure checks, and online desync and cheating checks.
