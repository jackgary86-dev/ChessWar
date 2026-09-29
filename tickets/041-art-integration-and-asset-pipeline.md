# Art integration and asset pipeline

**Milestone:** Art  
**Labels:** art, tooling

- `assets/` folder layout and naming conventions
- Sprite atlas or SVG sprite build step in Vite; preload with a loading screen
- Keep the Unicode-glyph renderer as a fallback if assets fail to load
- Budget: total art download under 2 MB on first load

**Done when:** swapping an asset file updates the game with no code changes.
