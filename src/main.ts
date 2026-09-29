import type { BattleState } from '@sim/battle.ts';
import { createAiPrep } from '@sim/ai.ts';
import { BATTLE } from '@sim/data.ts';
import {
  buyCard,
  buyXpIntent,
  createGame,
  lockShop,
  nextRound,
  ready,
  rerollShop,
  sellPiece,
  skipCombat,
  stepCombat,
} from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import type { Side } from '@sim/types.ts';
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
import { createHud } from '@ui/hud.ts';
import { computeLayout, shouldStack } from '@ui/layout.ts';
import type { Layout } from '@ui/layout.ts';
import { drawScene, fitCanvas, prefersReducedMotion, readTheme } from '@ui/render.ts';
import type { DrawPiece } from '@ui/render.ts';
import '@ui/theme.css';

// Overlays, tap-to-place and the battle log arrive with later M3 tickets. This
// entry point wires the HUD to a vs-AI match so the round loop can be played:
// shop with the HUD, press Fight, watch the animation, repeat.
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element');
}

const HUMAN: Side = 0;
const SEED = Date.now() % 1_000_000;
const PAGE_MARGIN_PX = 32;
const RESULT_HOLD_MS = 1200;
const BATTLEFIELD_HEIGHT_SHARE = 0.6;

const canvas = document.createElement('canvas');
canvas.className = 'battlefield';
const speedBar = document.createElement('div');
speedBar.className = 'controls';
const toast = document.createElement('div');
toast.className = 'toast';
const hudRoot = document.createElement('div');
hudRoot.className = 'hud';
app.append(canvas, speedBar, toast, hudRoot);
const maybeCtx = canvas.getContext('2d');
if (!maybeCtx) {
  throw new Error('Canvas 2D is not supported');
}
const ctx = maybeCtx;

const aiPrep = createAiPrep('normal');
const game: GameState = createGame({ mode: 'ai', seed: SEED }, aiPrep);
let selectedId: number | null = null;
let playback = createPlayback();
let snapshot: UnitSnapshot[] = [];
let animating: BattleState | null = null;
let resultShownAtMs: number | null = null;

function say(message: string): void {
  toast.textContent = message;
}

const hud = createHud(hudRoot, {
  buy(slot) {
    const result = buyCard(game, HUMAN, slot);
    if (result === 'bench-full') say('Bench is full. Sell or place a piece first.');
    else if (result === 'gold') say('Not enough gold.');
    else say('');
    refresh();
  },
  reroll() {
    rerollShop(game, HUMAN);
    refresh();
  },
  toggleLock() {
    lockShop(game, HUMAN);
    refresh();
  },
  buyXp() {
    buyXpIntent(game, HUMAN);
    refresh();
  },
  sell() {
    if (selectedId !== null) sellPiece(game, HUMAN, selectedId);
    selectedId = null;
    refresh();
  },
  ready() {
    if (!ready(game) || !game.battle) return;
    selectedId = null;
    animating = game.battle;
    snapshot = snapshotUnits(game.battle);
    playback = createPlayback();
    resultShownAtMs = null;
    say('');
    refresh();
  },
  selectBench(pieceId) {
    selectedId = pieceId === selectedId ? null : pieceId;
    refresh();
  },
});

function refresh(): void {
  hud.update(game, selectedId);
}

for (const speed of BATTLE.speeds) {
  const button = document.createElement('button');
  button.textContent = `${String(speed)}×`;
  button.addEventListener('click', () => {
    setSpeed(playback, speed);
  });
  speedBar.append(button);
}
const skipButton = document.createElement('button');
skipButton.textContent = 'Skip to result';
skipButton.addEventListener('click', () => {
  if (!animating) return;
  skipCombat(game);
  skipPlayback(playback, animating);
  refresh();
});
speedBar.append(skipButton);

/** Pieces on both boards during prep; the AI's board stays fogged. */
function prepPieces(): DrawPiece[] {
  return ([HUMAN] as const).flatMap((side) =>
    game.players[side].holdings.board.map((p) => ({
      type: p.type,
      side,
      stars: p.stars,
      x: p.x,
      y: p.y,
    })),
  );
}

const theme = readTheme(document.documentElement);
const reducedMotion = prefersReducedMotion();
let layout: Layout = computeLayout(1, 1, false);

function resize(): void {
  const width = Math.max(1, document.documentElement.clientWidth - PAGE_MARGIN_PX);
  const height = Math.max(1, window.innerHeight * BATTLEFIELD_HEIGHT_SHARE);
  layout = computeLayout(width, height, shouldStack(window.innerWidth));
  fitCanvas(canvas, layout, window.devicePixelRatio || 1);
}

let lastMs: number | null = null;
function frame(nowMs: number): void {
  const dtMs = lastMs === null ? 0 : nowMs - lastMs;
  lastMs = nowMs;

  let pieces: readonly DrawPiece[];
  let effects: ReturnType<typeof frameAt>['effects'] = [];
  if (animating) {
    const battle = animating;
    advancePlayback(playback, dtMs, battle, () => {
      stepCombat(game);
    });
    ({ pieces, effects } = frameAt(snapshot, battle.events, playback.time, reducedMotion));
    if (playbackDone(playback, battle)) {
      resultShownAtMs ??= nowMs;
      if (nowMs - resultShownAtMs > RESULT_HOLD_MS) {
        animating = null;
        if (game.phase === 'result') nextRound(game, aiPrep);
        refresh();
      }
    }
  } else {
    pieces = prepPieces();
  }
  drawScene(
    ctx,
    layout,
    theme,
    { pieces, effects, showHp: animating !== null },
    nowMs,
    reducedMotion,
  );
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
refresh();
requestAnimationFrame(frame);
