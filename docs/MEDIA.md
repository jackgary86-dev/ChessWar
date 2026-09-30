# Demo media

Status: the capture tooling and shot list are here. The media itself (3 GIFs, 5 good screenshots, trailer) still has to be recorded by a person on a machine with a display and an encoder.

## What is needed (ticket 056)

| Item | Shot |
|---|---|
| GIF 1 | A piece crossing the wall through a portal (rank 6 or 3) |
| GIF 2 | A 3-copy merge to ★★ or ★★★ with the level-up effect |
| GIF 3 | A full fight at 2× from first move to result |
| Screenshots 1–3 | Desktop: title screen, prep phase with pieces on the board, mid-fight |
| Screenshots 4–5 | Phone (390×844): prep phase, mid-fight |
| Trailer | 30–60 s: title, buy and merge, place, portal crossing, fight at 2×, result |

Save files under `docs/media/` (keep GIFs under about 3 MB each) and add the GIFs to the README under "Play the prototype".

## Capture script

`scripts/capture-media.mjs` drives a built copy of the game with Playwright and writes PNGs to `docs/media/`.

```
npm run build
npx vite preview --port 4173 &
NODE_PATH=$(npm root -g) node scripts/capture-media.mjs            # 5 screenshots
NODE_PATH=$(npm root -g) node scripts/capture-media.mjs --frames   # also 40 fight frames at 2×
```

Set `CHROMIUM=/path/to/chromium` if Playwright cannot find a browser. Playwright is not a project dependency.

Known limit: the script buys the first three shop cards but does not place pieces on the board, so its screenshots show an empty board and a fight that ends at once. Place the pieces by hand (or extend the script to tap a bench piece, then a board square) before using its output. Fight frames turn into a GIF with `ffmpeg -framerate 10 -i docs/media/frames/fight-%03d.png -vf "scale=800:-1" fight.gif`.

## Trailer

Record the screen at 1280×800 following the table above. Sound effects are in the game; the mute button is in the controls row.
