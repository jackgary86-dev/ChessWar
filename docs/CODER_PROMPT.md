# Coder Prompt: Chess War

You are a senior game developer. Build **Chess War**, a browser auto-battler ("auto chess") played with real chess pieces. Use the prototype at `prototype/chess-war.html` in this repo as a working reference for rules and feel, then rebuild it as a clean, tested, maintainable project. Where this prompt and the prototype disagree, follow this prompt.

---

## 1. The game in one paragraph

Two players each own an 8×8 chess board. The boards sit side by side, separated by a wall, and are linked by **portal squares**. Each round, players buy chess pieces from a shop (Dota Underlords style), combine 3 copies into higher star levels, and place **up to 8 pieces** on their own board. When both players are ready, both boards are revealed and the pieces **fight automatically to the end** using real chess movement, with HP and damage instead of instant captures. The loser of each fight loses player HP. The first player to reach 0 HP loses the match.

## 2. Tech stack and constraints

- **TypeScript + Vite**, no game engine. Render the battlefield on an HTML `<canvas>` and build the shop, bench and HUD as DOM.
- Keep the **simulation pure and deterministic**: no DOM, no `Math.random` and no timers inside `sim/`. Use a seeded RNG (for example mulberry32) passed in through state. The same seed and inputs must give the same battle. Later this lets an online server run the authoritative sim.
- **Vitest** for unit tests. **ESLint + Prettier**. Strict TypeScript.
- The build output (`dist/`) must be static files that any web server can host. It will be deployed to a home "Game Portal" web server: tested on a staging box first, then pushed to the live box.
- No backend in milestones 1–4. Online play is milestone 5.
- It must work on desktop and phone (about 390px wide) with touch.

### Project layout

```
chess-war/
  src/
    sim/            # pure game logic: no DOM
      types.ts      # Piece, Unit, Player, GameState, BattleState
      data.ts       # piece stats, pool sizes, odds, XP table (single source of balance numbers)
      rng.ts
      board.ts      # geometry, wall/portal rules, move + strike generation
      battle.ts     # tick-based combat simulation
      economy.ts    # income, interest, streaks, XP, levels
      shop.ts       # shared pool, rolling, buying, selling, merging
      ai.ts         # AI shopping + placement
      game.ts       # round flow state machine
    ui/
      render.ts     # canvas drawing + animation interpolation
      input.ts      # tap/click + drag-and-drop placement
      hud.ts        # scoreboard, shop, bench, log, overlays
    main.ts
  tests/
  index.html
  README.md
```

## 3. Rules spec

### 3.1 Battlefield

- A 16×8 grid in world coordinates. x 0–7 is Player 1 (Ivory, left board). x 8–15 is Player 2 (Ebony, right board). Files are labelled a–p and ranks 1–8.
- A **wall** runs between x=7 and x=8.
- **Portal squares** are (7,2), (7,5), (8,2), (8,5), which are ranks 6 and 3 on the inner edges.
- Any single step that crosses the wall is legal only if its start square or its end square is a portal square. Sliding pieces check each step of the slide.
- **Knights leap the wall anywhere.**
- Players place pieces anywhere on their own 8×8 board.
- On phone widths, rotate the view so the boards stack vertically, with Player 1 at the bottom. Input mapping must follow the rotation.

### 3.2 Pieces (1★ base values; keep all numbers in `data.ts`)

| Piece | Cost | Tier | HP | ATK | Acts every N ticks | Movement | Strike |
|---|---|---|---|---|---|---|---|
| Pawn | 1 | 1 | 380 | 45 | 2 | 1 square forward or diagonally forward (toward the enemy) | the 3 squares ahead |
| Knight | 2 | 2 | 520 | 70 | 2 | L-jump | knight squares |
| Bishop | 2 | 2 | 440 | 58 | 2 | diagonal slide, any distance | diagonal, up to 3 squares, line of sight |
| Rook | 3 | 3 | 780 | 72 | 3 | orthogonal slide | orthogonal, up to 3 squares |
| Queen | 5 | 4 | 720 | 95 | 2 | all 8 directions | all 8 directions, up to 3 squares |

There is **no King**. A fight ends when one side has no pieces left.

**Star scaling:** HP ×1 / 1.9 / 3.5 and ATK ×1 / 1.8 / 3.3 for 1★ / 2★ / 3★.

**Abilities (2★ / 3★):**
- **Pawn – Shield Wall:** takes 15% / 30% less damage while a friendly piece is orthogonally adjacent.
- **Knight – Fork:** also hits 1 / all other enemies on its knight squares.
- **Bishop – Blessing:** each strike heals the most wounded ally for 60% / 120% of its ATK.
- **Rook – Fortress:** takes 20% / 35% less damage.
- **Queen – Pierce:** also hits the enemy directly behind the target for 50% / 100%.

### 3.3 Combat simulation

- Combat is tick-based. Each piece has a cooldown, and its first action lands on a random tick between 1 and its speed (from the seeded RNG). Each tick, all living pieces are processed in a seeded shuffled order.
- When a piece acts:
  1. If any enemy is in its strike pattern, it strikes the one with the lowest HP.
     - Damage = `round(ATK × multiplier × (1 − armor))`, minimum 1.
     - If the target dies, the attacker **moves onto the target's square**, like a chess capture.
     - Abilities fire as part of the strike.
  2. Otherwise it moves along the shortest path, using a BFS over **its own chess move graph** with the current board occupancy, to the nearest square from which it could strike an enemy.
     - If no such path exists, it makes the legal move that most reduces its wall-aware king-step distance to the nearest enemy.
     - If no move helps, it waits 1 tick.
- **End conditions:**
  - One side has no pieces left.
  - No damage has been dealt for 26 ticks, or the fight reaches 220 ticks. The side with more remaining material wins, where material = sum of `cost × 3^(stars−1) × hp/maxHp`. An exact tie is a draw.
- Show at 1×/2×/4× speed with a "Skip to result" button. One tick is about 420 ms at 1×.

### 3.4 Economy and progression (Underlords style)

- Player HP starts at 50. Level starts at 2. **Pieces allowed on the board = level, max 8.** Levels run from 2 to 8.
- XP needed per level: 2→3: 2, 3→4: 4, 4→5: 6, 5→6: 10, 6→7: 14, 7→8: 20. +1 XP each round from round 2. **Buy XP:** 4 gold for 4 XP.
- **Round income:**
  - Round 1: 3 gold.
  - From round 2: base `min(5, round+2)`, plus interest `floor(gold/10)` (max 5), plus a streak bonus (win or loss streak of 2–3: +1, 4–5: +2, 6+: +3), plus 1 if you won the last fight.
- **Shop:**
  - 5 slots. Reroll costs 2 gold, and the shop re-rolls free each round unless locked.
  - "Lock shop" keeps the current shop for the next round.
  - The piece pool is **shared by both players**: Pawn 30, Knight 18, Bishop 18, Rook 14, Queen 9. Unbought shop pieces go back to the pool on reroll. Sold pieces return `3^(stars−1)` copies.
- **Tier odds by level (T1/T2/T3/T4 %):** L2 70/30/0/0 · L3 50/45/5/0 · L4 40/45/15/0 · L5 30/42/25/3 · L6 22/38/32/8 · L7 15/33/37/15 · L8 10/28/40/22. If a tier is empty, fall back to the nearest tier that has stock.
- The **bench** has 8 slots. You can buy with a full bench only if the purchase completes a merge.
- **Merging:** whenever 3 pieces of the same type and star level are owned (board + bench), merge them into one piece a star higher. Keep the merged piece where one of the copies stood, preferring a board copy. Merges chain (1★ → 2★ → 3★).
- **Selling** refunds `cost × 3^(stars−1)`.
- **Losing a fight** costs `2 + (sum of stars on the winner's surviving pieces) + floor(round/4)` HP. A draw costs each player 2 HP.

### 3.5 Round flow

`prep → (handoff) → combat → result → next round | game over`

- **vs AI:** the AI shops and places at the start of prep. Its board stays hidden (fogged) until the fight starts.
- **Local 2-player (hot-seat):** Player 1 preps, then clicks "Ready". A handoff screen asks the other player to look away. Player 2 preps and clicks "Fight". Each player's board and gold are hidden from the other during prep. Show a handoff screen before Player 1's prep each round too.

### 3.6 AI opponent

The AI should be a fair opponent that plays by the same rules.
- **Priorities each prep:**
  1. Buy shop pieces that match ones it already owns.
  2. Level up toward `min(8, 2 + floor((round+1)/2))`.
  3. Fill its army up to level+1 pieces with the most expensive piece it can afford, keeping 10 gold for interest from round 6.
  4. Reroll up to twice when it has 16+ gold, from round 5.
- **Placement:** use a formation.
  - Pawns in front on the portal lanes.
  - Knights behind them.
  - Rooks and the Queen in the middle.
  - Bishops at the back.
  - Its best pieces (by value) go on the board, and extra pieces are sold if the bench overflows.
- Make difficulty a parameter (easy / normal / hard) so it can be tuned later.

## 4. UI and presentation

- The look is a dark "war room table": warm charcoal ground, ivory vs ebony pieces, brass accents, violet portal glow, warm squares on Player 1's board and cool sage on Player 2's. Put all colors in CSS custom properties.
- Draw pieces with the chess glyphs ♟♞♝♜♛ (add U+FE0E so they don't render as emoji) using the **Noto Sans Symbols 2** font, with an outline, drop shadow, stars under the piece, and an HP bar over it during combat.
- **Animation:**
  - Smooth movement between squares, with a small arc for knight jumps.
  - Strike lines in the attacker's color.
  - Floating damage and heal numbers.
  - A ring and fade-out when a piece dies.
  - Portals pulse. Respect `prefers-reduced-motion`.
- **Placement input:** support tap-to-select-then-tap-target (required for touch) and **drag-and-drop** (new, not in the prototype) between bench and board. Tap two pieces to swap them. Show open squares while a bench piece is selected.
- **HUD:**
  - A scoreboard with each player's HP bar, gold, level, XP and streak.
  - Shop cards with a tier-colored top edge, cost, and pips showing how many copies you already own.
  - Current tier odds.
  - "On board X/level".
  - A Sell button that shows the refund.
  - A **battle log in chess notation** (for example `♞ c3×e4 Bishop falls`, portal crossings, round results).
  - A field-manual panel listing pieces, stats and abilities.
- **Overlays:** start screen (vs AI / 2 players on one screen), handoff, round result with a damage breakdown, and a game-over screen.

## 5. Milestones (deliver in order; each must build, pass tests, and be playable)

1. **Sim core:** `board.ts`, `battle.ts`, `data.ts`, `rng.ts` plus tests. No UI.
2. **Economy + shop + merging + AI:** `economy.ts`, `shop.ts`, `ai.ts`, `game.ts` plus tests. Include a headless CLI script, `npm run sim -- --games 500`, that runs AI-vs-AI matches and prints win rates by side, average match length, and how often each piece appears in winning armies. Use it for balance.
3. **UI parity with the prototype:** canvas renderer, HUD, vs-AI and hot-seat modes, responsive rotation.
4. **Polish:** drag-and-drop, save/resume of the current match in `localStorage` (wrap in try/catch), sound effects behind a mute toggle, and the AI difficulty setting.
5. **Online 1v1 (separate PR):** a small Node + WebSocket server.
   - The server owns the RNG seed, pool and battle sim, and runs the shared `sim/` code unchanged.
   - Clients send only intents: buy, sell, reroll, lock, buyXP, place, ready.
   - The server validates every intent and never trusts client state.
   - Include a lobby with room codes and reconnect handling.

## 6. Required tests (Vitest)

- **Wall/portal rules:**
  - A rook on h5 cannot slide to i5.
  - A rook on h6 can slide through the portal to i6 and beyond.
  - A bishop can enter from g7 to h6 (portal) to i5.
  - A knight on g4 can jump to i5.
- **Pawns:** a Player 1 pawn only moves toward +x, and a Player 2 pawn only toward −x. Pawn strike squares are correct for each side.
- **Slider strikes:** range is capped at 3, and line of sight is blocked by any piece.
- **Merging:** 3×1★ becomes 2★. 9×1★ bought in sequence becomes 3★. A full bench still allows a buy that completes a merge. Merged pieces keep a board position.
- **Pool:** buying, selling and rerolling conserve the total piece count across pool, shops, benches and boards.
- **Economy:** income, interest cap, streak bonus, XP levels, and the board cap enforced.
- **Determinism:** the same seed and armies give an identical battle log. A battle always ends within 220 ticks.
- **Damage:** armor from Rook and Pawn abilities, Queen pierce, Knight fork, and Bishop heal (never above max HP).
- **Balance smoke test:** over 500 mirrored AI-vs-AI games, neither side wins more than 55%.

## 7. Definition of done

- `npm run dev`, `npm run build`, `npm test`, `npm run lint` and `npm run sim` all work.
- No console errors during a full match in Chrome and Firefox, at desktop and 390px widths.
- The README covers how to play, rules, the project layout, how to tune balance in `data.ts`, and how to deploy `dist/` to a static web server.
- Commit in small, logically separated commits, one per milestone step. Don't commit secrets or `.env` files.

## 8. Working agreement

- Before coding, restate the plan and list any rule ambiguities you find, with your proposed default. Then proceed with the defaults unless told otherwise.
- Keep every balance number in `data.ts`. Nothing hard-coded elsewhere.
- After milestone 2, report `npm run sim` results and suggest 3 balance changes backed by the numbers.
- Don't add mechanics beyond this spec (Kings, synergies, items, pawn promotion) unless asked. List ideas under "Future" in the README instead.
