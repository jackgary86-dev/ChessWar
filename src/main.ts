import { GAME_NAME } from '@sim/index.ts';

// UI wiring lands in M3 (tickets 017–022). For now the entry point only proves
// that the Vite + TypeScript build and the @sim alias work end to end.
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element');
}

const title = document.createElement('h1');
title.textContent = GAME_NAME;
app.append(title);
