import type { BattleState } from '@sim/battle.ts';
import type { Holdings } from '@sim/shop.ts';
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
import { FEEDBACK_MS, activeMerges, detectPrepFeedback } from '@ui/feedback.ts';
import type { TimedMerge } from '@ui/feedback.ts';
import { createHud } from '@ui/hud.ts';
import { createFieldManual, createLogPanel } from '@ui/log.ts';
import { battleLog, detectMerges, resultLogLine } from '@ui/log-model.ts';
import { createOverlays } from '@ui/overlays.ts';
import { createSound } from '@ui/sound.ts';
import { cuesForEvents, roundCue } from '@ui/sound-model.ts';
import {
  DISCARDED_SAVE_MESSAGE,
  browserStorage,
  clearSave,
  loadGame,
  markTipsDone,
  readSave,
  saveGame,
  tipsDone,
} from '@ui/storage.ts';
import {
  FIRST_MATCH_TIP_ROUNDS,
  demoFinished,
  firstMatchTip,
  fullGameHref,
  isDemo,
  mergeNudge,
} from '@ui/demo-model.ts';
import { overlayView, visiblePrepSides } from '@ui/overlays-model.ts';
import { applyDrop, attachDrag } from '@ui/drag.ts';
import type { DropTarget } from '@ui/drag.ts';
import { createNetClient } from '@ui/net.ts';
import type { NetClient, SocketLike } from '@ui/net.ts';
import {
  battleFromFight,
  connectionNote,
  initialOnlineState,
  mirrorGame,
  onlineOverlay,
  onlineReduce,
  withResult,
} from '@ui/online-model.ts';
import type { OnlineEvent, OnlineState } from '@ui/online-model.ts';
import {
  attachBoardInput,
  attachBoardKeys,
  openSquares,
  tapBenchSlot,
  tapSquare,
} from '@ui/input.ts';
import type { Selection, TapResult } from '@ui/input.ts';
import type { Pos } from '@sim/board.ts';
import { PIECES } from '@sim/data.ts';
import { computeLayout, shouldStack } from '@ui/layout.ts';
import type { Layout } from '@ui/layout.ts';
import { drawScene, fitCanvas, prefersReducedMotion, readTheme } from '@ui/render.ts';
import type { DrawPiece } from '@ui/render.ts';
import { preloadArt } from '@ui/preload.ts';
import '@ui/theme.css';

// This entry point wires the HUD and overlays to a match (vs AI or hot-seat) so the round
// loop can be played: shop, place, Fight, watch the animation, read the result.
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element');
}

// Warm the art cache; the loading screen hides itself, and slow or failed art falls back to glyphs.
void preloadArt();

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
const tipBox = document.createElement('div');
tipBox.className = 'demo-tip';
tipBox.setAttribute('role', 'status');
tipBox.hidden = true;
app.append(canvas, speedBar, toast, tipBox, hudRoot, infoRoot);
const maybeCtx = canvas.getContext('2d');
if (!maybeCtx) {
  throw new Error('Canvas 2D is not supported');
}
const ctx = maybeCtx;

const demo = isDemo(window.location.search);
/** Demo: the last result has been dismissed. */
let demoDone = false;

const ONLINE_PORT = 8787;
const RETRY_MS = 1500;
const MAX_RETRIES = 20;
const aiPrep = createAiPrep('normal');
let game: GameState = createGame({ mode: 'ai', seed: SEED }, aiPrep);
let started = false;
const storage = browserStorage();
const firstRead = readSave(storage);
let hasSave = firstRead.game !== null;
/** Shown on the start screen when a damaged or outdated save was thrown away. */
let saveNotice: string | undefined = firstRead.discarded ? DISCARDED_SAVE_MESSAGE : undefined;

/** Save at the start of a prep phase, or drop the save once the war is over. */
function persist(): void {
  if (demo) return;
  if (game.phase === 'over') clearSave(storage);
  else saveGame(storage, game);
  hasSave = loadGame(storage) !== null;
}

/** The side whose prep it is; always Player 1 against the AI. */
function acting(): Side {
  return game.active;
}
let selection: Selection | null = null;
// Online play: the server owns the match, so `game` is a mirror of what it sent.
let online: OnlineState | null = null;
let net: NetClient | null = null;
/** The fight just played (online), kept until the player leaves the result screen. */
let resultFight: NonNullable<OnlineState['fight']> | null = null;
let playback = createPlayback();
let snapshot: UnitSnapshot[] = [];
let animating: BattleState | null = null;
let resultShownAtMs: number | null = null;
let loggedLines = 0;
let cuedEvents = 0;
const sound = createSound(storage);
/** Board merge bursts still playing during prep. */
let mergeBursts: TimedMerge[] = [];
let dropSquare: Pos | undefined;
let keyCursor: Pos | undefined;
const logPanel = createLogPanel(infoRoot);
createFieldManual(infoRoot);

function say(message: string): void {
  toast.textContent = message;
}

/** Play merge and level-up feedback for the change from `before` to the acting player's state now. */
function celebrate(
  before: Holdings,
  levelBefore: number,
  after: Holdings,
  levelAfter: number,
  boughtSlot?: number,
): void {
  const fx = detectPrepFeedback(before, after, levelBefore, levelAfter);
  const now = performance.now();
  for (const m of fx.merges) {
    if (m.where.kind === 'board')
      mergeBursts.push({ pos: m.where.pos, stars: m.stars, startMs: now });
  }
  hud.celebrate({
    benchSlots: fx.merges.flatMap((m) => (m.where.kind === 'bench' ? [m.where.slot] : [])),
    ...(fx.levelUp ? { levelUpSide: acting() } : {}),
    ...(boughtSlot === undefined ? {} : { boughtSlot }),
  });
}

const hud = createHud(hudRoot, {
  buy(slot) {
    if (online) {
      net?.send({ type: 'buy', slot });
      return;
    }
    const before = structuredClone(game.players[acting()].holdings);
    const result = buyCard(game, acting(), slot);
    const merges = detectMerges(before, game.players[acting()].holdings);
    const level = game.players[acting()].econ.level;
    celebrate(
      before,
      level,
      game.players[acting()].holdings,
      level,
      result === 'ok' ? slot : undefined,
    );
    logPanel.add(merges);
    if (merges.length > 0) sound.play('merge');
    else if (result === 'ok') sound.play('buy');
    if (result === 'bench-full') say('Bench is full. Sell or place a piece first.');
    else if (result === 'gold') say('Not enough gold.');
    else say('');
    refresh();
  },
  reroll() {
    if (online) {
      net?.send({ type: 'reroll' });
      return;
    }
    rerollShop(game, acting());
    refresh();
  },
  toggleLock() {
    if (online) {
      net?.send({ type: 'lock' });
      return;
    }
    lockShop(game, acting());
    refresh();
  },
  buyXp() {
    if (online) {
      net?.send({ type: 'buyXP' });
      return;
    }
    const before = structuredClone(game.players[acting()].holdings);
    const levelBefore = game.players[acting()].econ.level;
    buyXpIntent(game, acting());
    const player = game.players[acting()];
    celebrate(before, levelBefore, player.holdings, player.econ.level);
    refresh();
  },
  sell() {
    if (online) {
      if (selection) net?.send({ type: 'sell', pieceId: selection.id });
      selection = null;
      refresh();
      return;
    }
    if (selection) sellPiece(game, acting(), selection.id);
    selection = null;
    refresh();
  },
  ready() {
    if (online) {
      selection = null;
      net?.send({ type: 'ready' });
      return;
    }
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
    moveTo(selection, { kind: 'bench', slot });
  },
});

function applyTap(result: TapResult): void {
  selection = result.selection;
  say(result.message ?? '');
  refresh();
}

/**
 * Select or move a piece. Online, a move is applied to the local mirror at
 * once and also sent as an intent; the server's state (also sent when it
 * refuses) then replaces the mirror.
 */
function moveTo(source: Selection | null, target: DropTarget): void {
  const holdings = game.players[acting()].holdings;
  const before = online ? JSON.stringify(holdings) : '';
  let result: TapResult;
  if (source) result = applyDrop(game, acting(), source, target);
  else if (target.kind === 'square') result = tapSquare(game, acting(), null, target.pos);
  else result = tapBenchSlot(game, acting(), null, target.slot);
  if (source && online && JSON.stringify(holdings) !== before) {
    net?.send({
      type: 'place',
      pieceId: source.id,
      to:
        target.kind === 'square'
          ? { kind: 'board', x: target.pos.x, y: target.pos.y }
          : { kind: 'bench', slot: target.slot },
    });
  }
  applyTap(result);
}

/** Hints show in the demo, and in the first vs-AI match of the full game. */
function showTip(): void {
  if (!demo && game.round > FIRST_MATCH_TIP_ROUNDS) markTipsDone(storage);
  const wanted = demo || (!online && game.mode === 'ai' && !tipsDone(storage));
  const tip = wanted && started && animating === null ? firstMatchTip(game) : null;
  const nudge = tip ? mergeNudge(game) : null;
  tipBox.hidden = tip === null;
  tipBox.textContent = tip ? (nudge ? `${tip.text} ${nudge}` : tip.text) : '';
}

function refresh(): void {
  hud.update(game, selection?.id ?? null);
  showTip();
  // Speed, skip and sound controls belong to the fight; prep and the menus go without them.
  speedBar.hidden = animating === null;
  overlays.show(
    onlineOverlay(online) ??
      overlayView(game, {
        started: started || online !== null,
        animationDone: animating === null,
        canContinue: hasSave,
        ...(demo ? { demo, demoDone } : {}),
        ...(saveNotice ? { notice: saveNotice } : {}),
      }),
  );
}

// ---------------------------------------------------------------------------
// Online play
// ---------------------------------------------------------------------------

function serverUrl(): string {
  const override = new URLSearchParams(window.location.search).get('server');
  if (override) return override;
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.hostname}:${String(ONLINE_PORT)}`;
}

/** Show the server's latest state, unless a fight or its result is still on screen. */
function syncOnline(): void {
  if (!online?.view || animating || resultFight) return;
  const before = game.players[acting()].holdings;
  const next = mirrorGame(online.view);
  const merges = detectMerges(before, next.players[next.active].holdings);
  celebrate(
    before,
    game.players[acting()].econ.level,
    next.players[next.active].holdings,
    next.players[next.active].econ.level,
  );
  logPanel.add(merges);
  if (merges.length > 0) sound.play('merge');
  game = next;
  // Keep the player's selection while the piece is still theirs.
  const { holdings } = next.players[next.active];
  const owned = [...holdings.board, ...holdings.bench].some((p) => p?.id === selection?.id);
  if (!owned) selection = null;
}

function onlineEvent(event: OnlineEvent): void {
  if (!online) return;
  online = onlineReduce(online, event);
  if (event.type === 'fight' && online.fight) {
    // The state that follows the fight is held back until the result is dismissed.
    resultFight = online.fight;
    online = { ...online, fight: null };
    animating = battleFromFight(resultFight);
    snapshot = snapshotUnits(animating);
    playback = createPlayback();
    resultShownAtMs = null;
    loggedLines = 0;
    cuedEvents = 0;
    selection = null;
  }
  syncOnline();
  say(connectionNote(online) ?? '');
  refresh();
}

function leaveOnline(): void {
  net?.close();
  net = null;
  online = null;
  resultFight = null;
  animating = null;
  selection = null;
  started = false;
  game = createGame({ mode: 'ai', seed: SEED + game.round }, aiPrep);
  logPanel.clear();
  say('');
  refresh();
}

const overlays = createOverlays(app, {
  startOnline() {
    online = initialOnlineState();
    net = createNetClient({
      url: serverUrl(),
      createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      onMessage: onlineEvent,
      onStatus: (status) => {
        onlineEvent({ type: 'status', status });
      },
      retryMs: RETRY_MS,
      maxRetries: MAX_RETRIES,
    });
    refresh();
  },
  onlineCreate(name) {
    net?.send({ type: 'create', name });
  },
  onlineJoin(name, code) {
    if (code.trim() === '') {
      onlineEvent({ type: 'error', error: 'no-such-room' });
      return;
    }
    net?.send({ type: 'join', room: code.trim(), name });
  },
  onlineReady() {
    net?.send({ type: 'ready' });
  },
  onlineLeave: leaveOnline,
  start(mode: GameMode) {
    game = createGame({ mode: demo ? 'ai' : mode, seed: SEED + game.round }, aiPrep);
    started = true;
    demoDone = false;
    saveNotice = undefined;
    logPanel.clear();
    selection = null;
    animating = null;
    say('');
    persist();
    refresh();
  },
  continueSaved() {
    const read = readSave(storage);
    const saved = read.game;
    if (!saved) {
      hasSave = false;
      if (read.discarded) saveNotice = DISCARDED_SAVE_MESSAGE;
      refresh();
      return;
    }
    game = saved;
    started = true;
    saveNotice = undefined;
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
    if (online) {
      resultFight = null;
      syncOnline();
      refresh();
      return;
    }
    if (demo && demoFinished(game)) {
      demoDone = true;
      refresh();
      return;
    }
    nextRound(game, aiPrep);
    persist();
    refresh();
  },
  playFull() {
    window.location.assign(fullGameHref(window.location.href));
  },
  replayDemo() {
    demoDone = false;
    started = false;
    game = createGame({ mode: 'ai', seed: SEED + game.round }, aiPrep);
    refresh();
  },
  newWar() {
    if (online) {
      leaveOnline();
      return;
    }
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
  let effects: ReturnType<typeof frameAt>['effects'];
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
        if (online && resultFight) game = withResult(game, resultFight.result);
        const line = resultLogLine(game);
        if (line) logPanel.add([line]);
        const cue = game.result ? roundCue(game.result.winner, 0) : null;
        if (cue) sound.play(cue);
        refresh();
      }
    }
  } else {
    pieces = prepPieces();
    mergeBursts = mergeBursts.filter((m) => nowMs - m.startMs < FEEDBACK_MS);
    effects = reducedMotion
      ? []
      : activeMerges(mergeBursts, nowMs).map((m) => ({ kind: 'merge' as const, ...m }));
  }
  const placing = animating === null && game.phase === 'prep';
  const picked =
    placing && selection?.from === 'board'
      ? game.players[acting()].holdings.board.find((p) => p.id === selection?.id)
      : undefined;
  const marked = dropSquare ?? keyCursor;
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
      ...(marked ? { dropSquare: marked } : {}),
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
    moveTo(selection, { kind: 'square', pos });
  },
);

attachBoardKeys(
  canvas,
  acting,
  () => keyCursor ?? null,
  (pos) => {
    keyCursor = pos ?? undefined;
  },
  (pos) => {
    if (animating || game.phase !== 'prep') return;
    moveTo(selection, { kind: 'square', pos });
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
  enabled: () => (started || online !== null) && animating === null && game.phase === 'prep',
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
    moveTo(source, target);
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
