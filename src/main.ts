import { createBattle, stepBattle } from '@sim/battle.ts';
import type { ArmyPiece, BattleState } from '@sim/battle.ts';
import { BATTLE, PIECE_ORDER } from '@sim/data.ts';
import { createRng } from '@sim/rng.ts';
import type { StarLevel } from '@sim/types.ts';
import {
  advancePlayback,
  createPlayback,
  frameAt,
  playbackDone,
  setSpeed,
  skipPlayback,
  snapshotUnits,
} from '@ui/animation.ts';
import type { UnitSnapshot } from '@ui/animation.ts';
import { computeLayout, shouldStack } from '@ui/layout.ts';
import type { Layout } from '@ui/layout.ts';
import { drawScene, fitCanvas, prefersReducedMotion, readTheme } from '@ui/render.ts';
import '@ui/theme.css';

// The HUD and round flow arrive with later M3 tickets. Until then the entry
// point replays a demo fight so the renderer and animation can be seen working.
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element');
}

const canvas = document.createElement('canvas');
canvas.className = 'battlefield';
const controls = document.createElement('div');
controls.className = 'controls';
app.append(canvas, controls);
const maybeCtx = canvas.getContext('2d');
if (!maybeCtx) {
  throw new Error('Canvas 2D is not supported');
}
const ctx = maybeCtx;

const DEMO_STARS: readonly StarLevel[] = [1, 2, 3, 1, 2];
const DEMO_IVORY_X = 5;
const DEMO_EBONY_X = 10;
const DEMO_FIRST_RANK = 1;
const DEMO_PAGE_MARGIN_PX = 32;
const DEMO_RESTART_DELAY_MS = 1500;

const demoArmies: ArmyPiece[] = PIECE_ORDER.flatMap((type, i) => {
  const stars = DEMO_STARS[i] ?? 1;
  const y = DEMO_FIRST_RANK + i;
  return [
    { type, stars, pos: { x: DEMO_IVORY_X, y } },
    { type, stars, pos: { x: DEMO_EBONY_X, y: y + 1 } },
  ];
});

let seed = 1;
let battle: BattleState;
let snapshot: UnitSnapshot[];
let playback = createPlayback();
let finishedAtMs: number | null = null;

function startFight(): void {
  battle = createBattle(demoArmies, createRng(seed));
  seed += 1;
  snapshot = snapshotUnits(battle);
  playback = createPlayback();
  finishedAtMs = null;
}

function skipToResult(): void {
  while (!battle.finished) stepBattle(battle);
  skipPlayback(playback, battle);
}

for (const speed of BATTLE.speeds) {
  const button = document.createElement('button');
  button.textContent = `${String(speed)}×`;
  button.addEventListener('click', () => {
    setSpeed(playback, speed);
  });
  controls.append(button);
}
const skipButton = document.createElement('button');
skipButton.textContent = 'Skip to result';
skipButton.addEventListener('click', skipToResult);
controls.append(skipButton);

const theme = readTheme(document.documentElement);
const reducedMotion = prefersReducedMotion();
let layout: Layout = computeLayout(1, 1, false);

function resize(): void {
  const width = Math.max(1, document.documentElement.clientWidth - DEMO_PAGE_MARGIN_PX);
  const height = Math.max(1, window.innerHeight - DEMO_PAGE_MARGIN_PX - controls.offsetHeight);
  layout = computeLayout(width, height, shouldStack(window.innerWidth));
  fitCanvas(canvas, layout, window.devicePixelRatio || 1);
}

let lastMs: number | null = null;
function frame(nowMs: number): void {
  const dtMs = lastMs === null ? 0 : nowMs - lastMs;
  lastMs = nowMs;
  advancePlayback(playback, dtMs, battle, () => {
    stepBattle(battle);
  });
  if (playbackDone(playback, battle)) {
    finishedAtMs ??= nowMs;
    if (nowMs - finishedAtMs > DEMO_RESTART_DELAY_MS) {
      const keepSpeed = playback.speed;
      startFight();
      setSpeed(playback, keepSpeed);
    }
  }
  const { pieces, effects } = frameAt(snapshot, battle.events, playback.time, reducedMotion);
  drawScene(ctx, layout, theme, { pieces, effects, showHp: true }, nowMs, reducedMotion);
  requestAnimationFrame(frame);
}

startFight();
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
