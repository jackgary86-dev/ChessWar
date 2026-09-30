# Chess War

An auto-battler played with real chess pieces. Two players each own an 8×8 board. The boards sit side by side, split by a wall and linked by portal squares. Buy pieces from a shop, combine three copies into a stronger star level, place up to 8 pieces on your board, then watch both armies fight it out automatically.

## Play

**The current build (TypeScript).** Run `npm ci` then `npm run dev` and open the address Vite prints. Choose a mode on the title screen: play against the AI, hot-seat (two people on one screen, with a privacy screen between turns), or online 1v1. A match in progress is saved in the browser and can be resumed. Sound has a mute toggle, and the battle log and field manual are in the game.

**The prototype.** Open `prototype/chess-war.html` in a browser. It is a single file with no build step and is the reference for rules and feel. It carries a `Rules version` comment; bump it whenever a rule changes, and `tests/prototype-sync.test.ts` fails if its numbers drift from `src/sim/data.ts`.

## Playable demo

Add `?demo` to the page address (for example `http://localhost:5173/?demo`) for a short showcase: vs AI only, 5 rounds, hints through the first round (shop, placement, portals, merging), and an end screen that links to the full game. Demo matches are not saved. The script for presenting it is in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

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

## Tuning balance

Every balance number lives in `src/sim/data.ts`: piece cost, tier, HP, attack and speed (`PIECES`), star multipliers (`STAR_HP_MULT`, `STAR_ATK_MULT`), ability values (`ABILITY`), the board and battle timing (`BOARD`, `BATTLE`), economy and XP (`ECONOMY`, `XP_TO_NEXT_LEVEL`), pool sizes and shop odds (`POOL_SIZE`, `TIER_ODDS`), fight damage (`FIGHT_DAMAGE`) and AI behaviour (`AI`, `AI_DIFFICULTY`). Nothing else in `src/` may hard-code a balance value; ESLint's `no-magic-numbers` rule on `src/sim` enforces that.

To tune: edit `data.ts`, then check the effect with `npm run sim -- --games 500` (AI vs AI, reports win rates and match length) and run `npm test`, since tests pin some of these values. If a change alters a rule or number the prototype also states, update `prototype/chess-war.html` to match.

## Development

Requires Node 24 (see `.nvmrc`).

```
npm ci            install dependencies
npm run dev       start the Vite dev server
npm test          run the Vitest suite
npm run lint      ESLint + Prettier check
npm run build     type-check and build static files into dist/
npm run pieces    regenerate the piece sprites in assets/pieces/ from scripts/build-pieces.ts
npm run server    online 1v1 WebSocket server (PORT env var, default 8787): create a room, share the 4-letter code, both ready up. In the browser choose Play online; the client connects to `ws://<page host>:8787`, or to `?server=ws://host:port`
npm run sim       headless AI-vs-AI balance runner, e.g. npm run sim -- --games 500
npm run fuzz      battle simulation fuzz test over many seeds
npm run icons     regenerate app icons and favicon from the logo mark
npm run preview   serve the built dist/ locally
```

`src/sim` must stay pure and deterministic: no DOM, timers, `Math.random` or `Date.now`. ESLint enforces it.

CI runs lint, test, build and a 1-game sim on every push and pull request, and uploads `dist/` as a build artifact named `chess-war-dist-<commit sha>` (kept 14 days). Find it on the run page under Actions.

## Deploying

The build is static files. `npm run build` type-checks and writes everything to `dist/`; there is no server-side code for single-player.

1. **Staging.** Copy the contents of `dist/` into the web root of the staging server (NixonExpress) and play a full match there, including save and resume.
2. **Live Game Portal.** Once staging looks right, copy the same `dist/` into the live Game Portal web root. Keep the previous release's files (or zip) so you can put them back if something is wrong.

Serve the site over HTTP(S) from a folder or sub-path; asset links are relative. Opening `dist/index.html` from disk will not work in most browsers.

**Online server.** Online 1v1 needs the WebSocket server running: `npm run server` (port from the `PORT` env var, default 8787). The client connects to `ws://<page host>:8787`, or to whatever `?server=ws://host:port` says. Serve the game over `wss://` behind a proxy if the page is HTTPS.

**Releases.** A release is a `dist/` build from a green main, zipped and named by version (for example `chess-war-v1.0.0.zip`), with the version in `package.json` and a matching `CHANGELOG.md` entry. Review this README at every release tag.

## Reporting a bug

Open a new issue and choose the **Bug report** template (`.github/ISSUE_TEMPLATE/bug_report.yml`). Include the browser and device, what you did, what you expected, and the seed or round if you have it. Severity labels and how bugs are triaged are in [`docs/TRIAGE.md`](docs/TRIAGE.md).

## Repository layout

```
src/sim/                   Pure, deterministic game logic (no DOM, timers or Math.random)
src/ui/                    Canvas renderer, input and DOM HUD
src/main.ts                Browser entry point
src/server/                Online 1v1 WebSocket server (rooms, protocol)
tests/                     Vitest unit tests
scripts/sim.ts             Headless balance runner behind npm run sim
scripts/fuzz.ts            Battle fuzz runner behind npm run fuzz
scripts/server.ts          Entry point for npm run server
assets/, public/           Piece sprites, brand art, app icons and favicon
prototype/chess-war.html   Playable single-file prototype (reference for rules and feel)
docs/CODER_PROMPT.md       Spec and build brief for the full TypeScript project
docs/art/                  Art direction, style guide and UI kit
docs/DEMO_SCRIPT.md        Script for presenting the demo
docs/TRIAGE.md             Bug severity and triage process
.github/                   CI workflow, issue templates, labels, PR template
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

Milestones are on the Milestones page on GitHub. **Current stage: pre-Alpha** (M1 to M5, art, QA checks and the demo are merged; the gate checkers have not closed yet). Update this line when each gate checker closes.

Release stages, each closed by a gate checker issue:

- **Alpha**: core complete, played by the two admins
- **Beta**: final art, outside testers, balance pass 2
- **Launch**: v1.0 on the live Game Portal, rollback plan, hotfix window

Deployment target: static files, tested on staging before going to the live Game Portal server.
