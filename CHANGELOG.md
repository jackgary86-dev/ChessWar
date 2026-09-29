# Changelog

All notable changes to Chess War. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Releases are tagged `vX.Y.Z`; see `docs/RELEASING.md`.

## [Unreleased]

### Added

- Game logic core: board with wall and portals, piece movement and strikes, tick-based battle simulation, star abilities and fight end rules.
- Economy, shared piece pool, shop, 3-copy merging, income, interest, streaks, XP and levels, round flow and HP damage.
- AI opponent and a headless balance runner (`npm run sim`).
- Canvas UI with combat animation, HUD, tap and drag placement, hot-seat privacy, battle log, field manual, save and resume, and sound.
- Online 1v1 over WebSockets with room codes, ready-up, reconnect and forfeit.
- Art: piece sprites, star visuals, boards, portals, VFX, shop cards, UI kit, logo and icons.
- QA: battle fuzz test, economy invariants, hot-seat and save/resume checks, bug report template.
