# Chess War

An auto-battler played with real chess pieces. Two players each own an 8×8 board. The boards sit side by side, split by a wall and linked by portal squares. Buy pieces from a shop, combine three copies into a stronger star level, place up to 8 pieces on your board, then watch both armies fight it out automatically.

## Play the prototype

Open `prototype/chess-war.html` in a browser. It is a single file with no build step. You can play against the AI, or with two people taking turns on the same screen.

## How a round works

1. **Shop.** Spend gold on pieces, rerolls (2 gold) and XP (4 gold). Your level sets how many pieces you can field, up to 8.
2. **Place.** Move pieces between your 8-slot bench and your own board.
3. **Fight.** Both boards are revealed. Pieces move and strike automatically using chess movement, with HP and damage instead of instant captures.
4. **Result.** The loser takes damage based on the winner's surviving pieces. The first player to reach 0 HP loses the war.

## Rules at a glance

- **Portals.** Pieces can only cross the wall through the glowing portal squares on ranks 6 and 3. Knights leap the wall anywhere.
- **Stars.** 3 copies merge into ★★. 3 ★★ merge into ★★★. Stars raise HP and attack and unlock each piece's ability.
- **Captures.** A piece that lands a killing blow moves onto that square.

| Piece | Cost | Ability at ★★ / ★★★ |
|---|---|---|
| ♟ Pawn | 1 | Shield Wall: takes less damage when a friendly piece is beside it |
| ♞ Knight | 2 | Fork: also hits other enemies on its knight squares |
| ♝ Bishop | 2 | Blessing: each strike heals the most wounded ally |
| ♜ Rook | 3 | Fortress: takes less damage |
| ♛ Queen | 5 | Pierce: strikes also hit the enemy behind the target |

The full rules, including numbers, economy and AI behavior, are in [`docs/CODER_PROMPT.md`](docs/CODER_PROMPT.md).

## Development

Requires Node 24 (see `.nvmrc`).

```
npm ci            install dependencies
npm run dev       start the Vite dev server
npm test          run the Vitest suite
npm run lint      ESLint + Prettier check
npm run build     type-check and build static files into dist/
npm run server    online 1v1 WebSocket server (PORT env var, default 8787)
npm run sim       headless AI-vs-AI balance runner, e.g. npm run sim -- --games 500
```

CI runs lint, test, build and a 1-game sim on every push and pull request.

## Repository layout

```
src/sim/                   Pure, deterministic game logic (no DOM, timers or Math.random)
src/ui/                    Canvas renderer, input and DOM HUD
src/main.ts                Browser entry point
tests/                     Vitest unit tests
scripts/sim.ts             Headless balance runner behind npm run sim
prototype/chess-war.html   Playable single-file prototype (reference for rules and feel)
docs/CODER_PROMPT.md       Spec and build brief for the full TypeScript project
docs/tickets.json          Development tickets (one GitHub issue each)
tickets/                   The same tickets as one Markdown file each
scripts/upload-tickets.ps1 Creates labels, milestones and issues on GitHub, one issue every 10 s
```

## Roadmap

Development is tracked as GitHub issues, grouped into milestones:

1. **M1 Game logic core** with tests
2. **M2 Economy, shop and AI**, plus an AI-vs-AI balance runner
3. **M3 UI** matching the prototype
4. **M4 Polish**: drag-and-drop, save/resume, sound, deploy
5. **M5 Online** 1v1 with a WebSocket server

Running alongside those:

- **Art**: style guide first, then pieces, boards, portals, VFX and UI
- **QA and bug checks**: checklists for the sim, economy, UI, saves, performance, accessibility and online play
- **Demo and artifacts**: CI builds, preview deploys, release zips, a demo build and demo media

Release stages, each closed by a gate checker issue:

- **Alpha**: core complete, played by the two admins
- **Beta**: final art, outside testers, balance pass 2
- **Launch**: v1.0 on the live Game Portal, rollback plan, hotfix window

Deployment target: static files, tested on staging before going to the live Game Portal server.
