import { PIECE_ORDER } from '@sim/data.ts';
import { BOARD } from '@sim/data.ts';
import type { StarLevel } from '@sim/types.ts';
import { computeLayout, shouldStack } from '@ui/layout.ts';
import type { Layout } from '@ui/layout.ts';
import { drawScene, fitCanvas, prefersReducedMotion, readTheme } from '@ui/render.ts';
import type { DrawPiece, Scene } from '@ui/render.ts';
import '@ui/theme.css';

// The HUD and round flow arrive with later M3 tickets. Until then the entry
// point draws a static demo position so the renderer can be seen working.
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element');
}

const canvas = document.createElement('canvas');
canvas.className = 'battlefield';
app.append(canvas);
const maybeCtx = canvas.getContext('2d');
if (!maybeCtx) {
  throw new Error('Canvas 2D is not supported');
}
const ctx = maybeCtx;

const DEMO_STARS: readonly StarLevel[] = [1, 2, 3, 1, 2];
const DEMO_HP = 0.7;
const DEMO_MAX_HP = 100;
const DEMO_BACK_RANK_X = 1;
const DEMO_SIDE_GAP = 2;
const DEMO_PAGE_MARGIN_PX = 32;

const demoPieces: DrawPiece[] = PIECE_ORDER.flatMap((type, i) => {
  const stars = DEMO_STARS[i] ?? 1;
  const hp = DEMO_HP * DEMO_MAX_HP;
  const y = DEMO_SIDE_GAP + i;
  return [
    { type, side: 0 as const, stars, x: DEMO_BACK_RANK_X, y, hp, maxHp: DEMO_MAX_HP },
    {
      type,
      side: 1 as const,
      stars,
      x: BOARD.width - 1 - DEMO_BACK_RANK_X,
      y,
      hp,
      maxHp: DEMO_MAX_HP,
    },
  ];
});
const scene: Scene = { pieces: demoPieces, showHp: true };

const theme = readTheme(document.documentElement);
const reducedMotion = prefersReducedMotion();
let layout: Layout = computeLayout(1, 1, false);

function resize(): void {
  const width = Math.max(1, document.documentElement.clientWidth - DEMO_PAGE_MARGIN_PX);
  const height = Math.max(1, window.innerHeight - DEMO_PAGE_MARGIN_PX);
  layout = computeLayout(width, height, shouldStack(window.innerWidth));
  fitCanvas(canvas, layout, window.devicePixelRatio || 1);
}

function frame(timeMs: number): void {
  drawScene(ctx, layout, theme, scene, timeMs, reducedMotion);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
