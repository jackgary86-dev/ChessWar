import type { BattleState } from '@sim/battle.ts';
import { createAiPrep } from '@sim/ai.ts';
import { BATTLE } from '@sim/data.ts';
import {
  buyCard,
  buyXpIntent,
  confirmHandoff,
  createGame,
  lockShop,
  nextRound,
  ready,
  rerollShop,
  sellPiece,
  skipCombat,
  stepCombat,
} from '@sim/game.ts';
import type { GameMode, GameState } from '@sim/game.ts';
import type { PieceType, Side } from '@sim/types.ts';
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
import { createFieldManual, createLogPanel } from '@ui/log.ts';
import { battleLog, detectMerges, resultLogLine } from '@ui/log-model.ts';
import { createOverlays } from '@ui/overlays.ts';
import { createSound } from '@ui/sound.ts';
import { cuesForEvents, roundCue } from '@ui/sound-model.ts';
import { browserStorage, clearSave, loadGame, saveGame } from '@ui/storage.ts';
import { overlayView, visiblePrepSides } from '@ui/overlays-model.ts';
import { applyDrop, attachDrag } from '@ui/drag.ts';
import { attachBoardInput, openSquares, tapBenchSlot, tapSquare } from '@ui/input.ts';
import type { Selection, TapResult } from '@ui/input.ts';
import type { Pos } from '@sim/board.ts';
import { PIECES } from '@sim/data.ts';
import { computeLayout, shouldStack } from '@ui/layout.ts';
import type { Layout } from '@ui/layout.ts';
import { drawScene, fitCanvas, prefersReducedMotion, readTheme } from '@ui/render.ts';
import type { DrawPiece } from '@ui/render.ts';
import '@ui/theme.css';

// This entry point wires the HUD and overlays to a match (vs AI or hot-seat) so the round
// loop can be played: shop, place, Fight, watch the animation, read the result.
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element');
}

const SEED = Date.now() % 1_000_000;
const PAGE_MARGIN_PX = 32;
const RESULT_HOLD_MS = 800;
const BATTLEFIELD_HEIGHT_SHARE = 0.6;

const canvas = document.createElement('canvas');
canvas.className = 'battlefield';
const speedBar = document.createElement('div');
speedBar.className = 'controls';
const toast = document.createElement('div');
toast.className = 'toast';
const hudRoot = document.createElement('div');
hudRoot.className = 'hud';
const infoRoot = document.createElement('div');
infoRoot.className = 'hud';
app.append(canvas, speedBar, toast, hudRoot, infoRoot);
const maybeCtx = canvas.getContext('2d');
if (!maybeCtx) {
  throw new Error('Canvas 2D is not supported');
}
const ctx = maybeCtx;

const aiPrep = createAiPrep('normal');
let game: GameState = createGame({ mode: 'ai', seed: SEED }, aiPrep);
let started = false;
const storage = browserStorage();
let hasSave = loadGame(storage) !== null;

/** Save at the start of a prep phase, or drop the save once the war is over. */
function persist(): void {
  if (game.phase === 'over') clearSave(storage);
  else saveGame(storage, game);
  hasSave = loadGame(storage) !== null;
}

/** The side whose prep it is; always Player 1 against the AI. */
function acting(): Side {
  return game.active;
}
let selection: Selection | null = null;
let playback = createPlayback();
let snapshot: UnitSnapshot[] = [];
let animating: BattleState | null = null;
let resultShownAtMs: number | null = null;
let loggedLines = 0;
let cuedEvents = 0;
const sound = createSound(storage);
let dropSquare: Pos | undefined;
const logPanel = createLogPanel(infoRoot);
createFieldManual(infoRoot);

function say(message: string): void {
  toast.textContent = message;
}

const hud = createHud(hudRoot, {
  buy(slot) {
    const before = structuredClone(game.players[acting()].holdings);
    const result = buyCard(game, acting(), slot);
    const merges = detectMerges(before, game.players[acting()].holdings);
    logPanel.add(merges);
    if (merges.length > 0) sound.play('merge');
    else if (result === 'ok') sound.play('buy');
    if (result === 'bench-full') say('Bench is full. Sell or place a piece first.');
    else if (result === 'gold') say('Not enough gold.');
    else say('');
    refresh();
  },
  reroll() {
    rerollShop(game, acting());
    refresh();
  },
  toggleLock() {
    lockShop(game, acting());
    refresh();
  },
  buyXp() {
    buyXpIntent(game, acting());
    refresh();
  },
  sell() {
    if (selection) sellPiece(game, acting(), selection.id);
    selection = null;
    refresh();
  },
  ready() {
    if (!ready(game)) return;
    selection = null;
    say('');
    if (game.battle) {
      animating = game.battle;
      snapshot = snapshotUnits(game.battle);
      playback = createPlayback();
      resultShownAtMs = null;
      loggedLines = 0;
      cuedEvents = 0;
    }
    refresh();
  },
  tapBench(slot) {
    applyTap(tapBenchSlot(game, acting(), selection, slot));
  },
});

function applyTap(result: TapResult): void {
  selection = result.selection;
  say(result.message ?? '');
  refresh();
}

function refresh(): void {
  hud.update(game, selection?.id ?? null);
  overlays.show(
    overlayView(game, { started, animationDone: animating === null, canContinue: hasSave }),
  );
}

const overlays = createOverlays(app, {
  start(mode: GameMode) {
    game = createGame({ mode, seed: SEED + game.round }, aiPrep);
    started = true;
    logPanel.clear();
    selection = null;
    animating = null;
    say('');
    persist();
    refresh();
  },
  continueSaved() {
    const saved = loadGame(storage);
    if (!saved) {
      hasSave = false;
      refresh();
      return;
    }
    game = saved;
    started = true;
    logPanel.clear();
    selection = null;
    animating = null;
    say('');
    refresh();
  },
  confirmHandoff() {
    confirmHandoff(game);
    refresh();
  },
  nextRound() {
    nextRound(game, aiPrep);
    persist();
    refresh();
  },
  newWar() {
    started = false;
    game = createGame({ mode: 'ai', seed: SEED + game.round }, aiPrep);
    refresh();
  },
});

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
  cuedEvents = animating.events.length;
  refresh();
});
speedBar.append(skipButton);

const muteButton = document.createElement('button');
function showMute(): void {
  muteButton.textContent = sound.isMuted() ? 'Sound off' : 'Sound on';
  muteButton.setAttribute('aria-pressed', String(sound.isMuted()));
}
muteButton.addEventListener('click', () => {
  sound.setMuted(!sound.isMuted());
  showMute();
});
showMute();
speedBar.append(muteButton);

/** Pieces on the boards that may be seen during prep (the AI's stays fogged). */
function prepPieces(): DrawPiece[] {
  return visiblePrepSides(game).flatMap((side) =>
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
    const lines = battleLog(snapshot, battle.events);
    const due = lines.slice(loggedLines).filter((l) => l.tick - 1 < playback.time);
    logPanel.add(due);
    loggedLines += due.length;
    const cued = cuesForEvents(battle.events, cuedEvents, playback.time);
    cuedEvents = cued.next;
    for (const cue of cued.cues) sound.play(cue);
    if (playbackDone(playback, battle)) {
      resultShownAtMs ??= nowMs;
      if (nowMs - resultShownAtMs > RESULT_HOLD_MS) {
        animating = null;
        const line = resultLogLine(game);
        if (line) logPanel.add([line]);
        const cue = game.result ? roundCue(game.result.winner, 0) : null;
        if (cue) sound.play(cue);
        refresh();
      }
    }
  } else {
    pieces = prepPieces();
  }
  const placing = animating === null && game.phase === 'prep';
  const picked =
    placing && selection?.from === 'board'
      ? game.players[acting()].holdings.board.find((p) => p.id === selection?.id)
      : undefined;
  drawScene(
    ctx,
    layout,
    theme,
    {
      pieces,
      effects,
      showHp: animating !== null,
      highlights: placing ? openSquares(game, acting(), selection) : [],
      ...(picked ? { selected: { x: picked.x, y: picked.y } } : {}),
      ...(dropSquare ? { dropSquare } : {}),
    },
    nowMs,
    reducedMotion,
  );
  requestAnimationFrame(frame);
}

attachBoardInput(
  canvas,
  () => layout,
  (pos) => {
    if (animating || game.phase !== 'prep') return;
    applyTap(tapSquare(game, acting(), selection, pos));
  },
);

function ownedPiece(id: number): { type: PieceType } | null | undefined {
  const { holdings } = game.players[acting()];
  return [...holdings.board, ...holdings.bench].find((p) => p?.id === id);
}

attachDrag({
  canvas,
  benchRoot: hudRoot,
  getLayout: () => layout,
  enabled: () => started && animating === null && game.phase === 'prep',
  sourceAtSquare(pos) {
    const piece = game.players[acting()].holdings.board.find((p) => p.x === pos.x && p.y === pos.y);
    return piece ? { id: piece.id, from: 'board' } : null;
  },
  sourceAtBench(slot) {
    const piece = game.players[acting()].holdings.bench[slot];
    return piece ? { id: piece.id, from: 'bench' } : null;
  },
  ghostGlyph: (source) => {
    const piece = ownedPiece(source.id);
    return piece ? PIECES[piece.type].glyph : '';
  },
  onStart(source) {
    selection = source;
    say('');
    refresh();
  },
  onHover(target) {
    dropSquare = target?.kind === 'square' ? target.pos : undefined;
  },
  onDrop(source, target) {
    dropSquare = undefined;
    applyTap(applyDrop(game, acting(), source, target));
  },
  onCancel() {
    dropSquare = undefined;
    selection = null;
    refresh();
  },
});

window.addEventListener('resize', resize);
resize();
refresh();
requestAnimationFrame(frame);
