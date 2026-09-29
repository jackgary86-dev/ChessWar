# Project scaffold: Vite + TypeScript + Vitest + CI

**Milestone:** M1 Game logic core  
**Labels:** chore, setup

Set up the repo for the production build.

- Vite + TypeScript (strict), ESLint + Prettier, Vitest
- Folder layout from `docs/CODER_PROMPT.md` §2 (`src/sim`, `src/ui`, `tests`)
- npm scripts: `dev`, `build`, `test`, `lint`, `sim`
- GitHub Actions workflow running lint, test and build on every push and PR
- `.gitignore` for node_modules, dist, .env

**Done when:** a fresh clone runs `npm ci && npm test && npm run build` green, and CI passes on the PR.
