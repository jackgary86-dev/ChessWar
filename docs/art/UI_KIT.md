# HUD and UI kit

Deliverable of ticket 038. Follows [`STYLE_GUIDE.md`](STYLE_GUIDE.md) tokens.

- **Icons:** `assets/icons/*.svg`, nine icons on a 24 px grid with a 2 px round stroke in `currentColor`: gold, xp, hp, reroll, lock, sell, sound-on, sound-off, settings. Recolor them with CSS `color`, or inline them as `<symbol>`s (see the sheet).
- **Component sheet:** [`ui-kit/sheet.html`](ui-kit/sheet.html) shows buttons (primary, secondary, toggle, disabled), panels, the scoreboard (HP bar, gold, level and XP bar, streak badge), bench slots (empty, filled, selected), the speed control and a tooltip. It links `src/ui/theme.css` directly, so it follows the game's tokens.
- **Rules:** numbers use the mono face with tabular figures; body text is at least 13 px on a phone; icons never carry meaning alone, so give each one a text label or `aria-label`.

Wiring the icons into the live HUD belongs to ticket 041 (art integration).
