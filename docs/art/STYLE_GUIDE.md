# Chess War art style guide

Status: **proposed by the overnight routine, needs the owner's sign-off on the style choice** (section 1). The palette in section 2 is not new: it is the set of tokens already in `src/ui/theme.css`, written down so art can be made against it.

Every other art ticket (sprites, star levels, board, VFX, HUD kit, logo, icon) builds on this page.

## 1. Rendering style

Three options were sketched as procedural studies in [`moodboards/`](moodboards/). They are studies, not final art.

| Option | Study | For | Against |
|---|---|---|---|
| **A. Flat vector** | [`a-flat-vector.svg`](moodboards/a-flat-vector.svg) | Crisp at 28 px and at 128 px from one SVG; tiny files; recolors cleanly for tiers, stars and both sides; matches the current canvas renderer and CSS tokens. | Least "painterly"; needs care so it does not look like clip art. |
| B. Pixel art | [`b-pixel.svg`](moodboards/b-pixel.svg) | Strong charm, tiny sprites. | Knight and bishop silhouettes blur at 28 px; needs separate integer-scale sets (1×, 2×, 3×) and fights the smooth HUD. |
| C. Painted 2D | [`c-painted.svg`](moodboards/c-painted.svg) | Richest look. | Detail is lost at 28 px; raster assets per size; large files; hardest to keep consistent across 10 pieces × 3 star levels. |

**Recommendation: A, flat vector.** Solid fills, one outline weight, brass accents, soft light only as a flat highlight stroke. If the owner prefers B or C, only sections 1 and 5 change; the palette, type and readability rules hold for all three.

Drawing rules for style A:

- 64 × 64 viewBox per piece. The base plinth sits on y = 50–58, so every piece shares one baseline; the top of the tallest piece (Queen) stops at y = 4.
- One outline weight: 2.5 units. Round joins. No gradients, no drop shadows inside the sprite (shadows are drawn by the board layer).
- Highlights are a single short stroke in a tone one step off the fill (see the pawn samples).

## 2. Palette (design tokens)

CSS custom properties, already defined in `src/ui/theme.css`. Use the token, never the hex, in code.

| Role | Token | Hex |
|---|---|---|
| Page ground | `--ground` | `#14120e` |
| Panel | `--panel` / `--panel-2` | `#1e1b15` / `#27231b` |
| Panel line | `--line` | `#3b3529` |
| Ink (text) | `--ink` | `#ede5d1` |
| Muted text | `--muted` | `#a39985` |
| **Ivory side** (fill) | `--ivory` | `#f1e9d4` |
| **Ebony side** (fill) | `--ebony` | `#1c1914` |
| Brass accent | `--brass` (`--brass-ink` on brass) | `#d3a64d` (`#1a1408`) |
| Crimson (damage, danger) | `--crimson` | `#d65a43` |
| Heal | `--heal` | `#7cc977` |
| **Portal** | `--portal` | `#a47fff` |
| Wall | `--wall` | `#0b0a08` |
| Board 1, light / dark | `--sq-light-1` / `--sq-dark-1` | `#dccca5` / `#9c805a` |
| Board 2, light / dark | `--sq-light-2` / `--sq-dark-2` | `#c0c6b3` / `#76826c` |
| **Tier 1 / 2 / 3 / 4** | `--t1` … `--t4` | `#9b968a` / `#6fb56b` / `#5c9ce0` / `#e2aa3a` |

Sprite colors (new, used only inside piece art):

| Use | Ivory | Ebony |
|---|---|---|
| Fill | `#f1e9d4` (`--ivory`) | `#2b271f` (a step lighter than `--ebony` so the form reads) |
| Outline | `#1c1914` | `#ede5d1` |
| Highlight stroke | `#cfc3a4` | `#4a4336` |

Star trim (for ticket 032): 1★ no trim, 2★ silver `#c9ced6`, 3★ gold `#e2aa3a`. Trim must be a shape (plinth ring or pips), never color alone.

### Contrast (computed, WCAG luminance ratio)

| Pair | Ratio |
|---|---|
| Ivory outline on light squares (1 / 2) | 11.0 / 10.0 |
| Ivory outline on dark squares (1 / 2) | 4.7 / 4.3 |
| Ebony fill on light squares (1 / 2) | 9.4 / 8.5 |
| Ebony fill on dark squares (1 / 2) | 4.0 / 3.7 |
| Ebony rim on dark squares (1 / 2) | 3.0 / 3.2 |
| Ink on ground | 14.9 |
| Muted on ground / on panel | 6.6 / 6.1 |
| Brass, portal on ground | 8.3, 6.3 |
| Tier colors on panel (T1–T4) | 5.8, 7.0, 6.0, 8.2 |

Every piece-versus-square pairing is at least 3:1 (the WCAG bar for graphics) thanks to the outline (Ivory) and the rim (Ebony). The Ivory *fill* on a light square is only about 1.3:1, so Ivory pieces are recognized by their outline, not their fill. Do not drop the outline.

## 3. Typography

All three are open-license (SIL OFL) Google Fonts, so they can be bundled with the game.

| Use | Face | Fallback stack |
|---|---|---|
| Display: logo, overlay headings, round titles | **Cinzel** (600, 700) | `Georgia, 'Times New Roman', serif` |
| Body: HUD labels, buttons, field manual | **Inter** (400, 500, 600) | `system-ui, -apple-system, 'Segoe UI', sans-serif` |
| Mono: battle log in chess notation, gold, HP, numbers | **JetBrains Mono** (400, 600) | `ui-monospace, Menlo, Consolas, monospace` |

Rules: numbers in the HUD use the mono face with tabular figures so gold and HP do not jitter; body text is never below 13 px on a phone; headings use display face only above 20 px (Cinzel is hard to read small). Fonts are self-hosted in `assets/fonts/` (a later ticket); until then the fallback stacks apply.

## 4. Readability rules

1. **28 px test.** Every piece must be recognizable at 28 × 28 px on a phone, next to another piece type, on the worst square (Ebony on the dark square, Ivory on the light square). Each sprite is checked by rendering it at 28 px on all four board colors (a script for this can come with ticket 032).
2. **Silhouette first.** The five pieces must differ by outline alone: Pawn round head on a cone, Knight asymmetric head, Bishop pointed head with a slit, Rook flat crenellated top, Queen crown points. If a filled black silhouette of two pieces looks the same, redraw one.
3. **Same side, same shape.** Ivory and Ebony share geometry and differ only in the colors above. No side-specific details.
4. **Outline is mandatory** (2.5 units at 64 viewBox, about 1 px at 28 px). It is what separates pieces from squares.
5. **Star level is shape, not color.** Pips and a plinth ring, so color-blind players can read it.
6. **Never rely on color alone:** portal squares carry a dashed ring and a center dot; damage numbers and heals carry `−` and `+`.
7. **Text on panels** meets 4.5:1; all current tokens do (table above).
8. **Motion** respects `prefers-reduced-motion`, as the renderer already does.

## 5. Samples

Hand-written SVG. The Pawn was rendered in headless Chromium at 128 px and at 28 px on the worst-case squares (Ivory on the light and on the green-dark square, Ebony on the brown-dark and on the light square) and stays readable.

- Sample pieces (Pawn, both sides): [`samples/piece-pawn-ivory.svg`](samples/piece-pawn-ivory.svg), [`samples/piece-pawn-ebony.svg`](samples/piece-pawn-ebony.svg)
- Sample board squares (light, dark, portal, wall, and both sides' pawns on all four square colors): [`samples/board-squares.svg`](samples/board-squares.svg)

The Pawn is the only finished sample; the other four pieces are ticket 032 (`assets/pieces/`).

## 6. Open questions for the owner

- Confirm style A (flat vector), or pick B or C.
- Confirm the three fonts, or name replacements.
- The Ebony fill `#2b271f` is a proposal; `--ebony` (`#1c1914`) is kept for UI use.
