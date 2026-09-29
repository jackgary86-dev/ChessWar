/**
 * Bug check (QA ticket): hot-seat privacy and round flow, at the model level
 * (what the HUD, board and overlays are told to show, and the phase machine
 * behind the Skip, speed and result controls).
 */
import { describe, expect, it } from 'vitest';

import { BATTLE, FIGHT_DAMAGE } from '@sim/data.ts';
import { confirmHandoff, createGame, nextRound, ready, skipCombat, stepCombat } from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import { dockView, scoreboardView } from '../src/ui/hud-model.ts';
import { overlayView, visiblePrepSides } from '../src/ui/overlays-model.ts';
import {
  advancePlayback,
  createPlayback,
  playbackDone,
  setSpeed,
  skipPlayback,
} from '../src/ui/animation.ts';

const SEED = 33;
const ROUNDS = 6;
const SHOWN = { started: true, animationDone: true } as const;

function local(): GameState {
  return createGame({ mode: 'local', seed: SEED });
}

/** Put a piece on each board so the fight has a clear winner. */
function stage(game: GameState): void {
  game.players[0].holdings.board.push({ id: 900, type: 'Q', stars: 3, x: 1, y: 3 });
  game.players[1].holdings.board.push({ id: 901, type: 'P', stars: 1, x: 14, y: 3 });
}

describe('hot-seat privacy', () => {
  it('shows only the active player’s board, and nothing during the handoff', () => {
    const game = local();
    game.players[0].holdings.board.push({ id: 900, type: 'Q', stars: 1, x: 1, y: 3 });
    game.players[1].holdings.board.push({ id: 901, type: 'P', stars: 1, x: 14, y: 3 });
    expect(game.phase).toBe('handoff');
    expect(visiblePrepSides(game)).toEqual([]);
    confirmHandoff(game);
    expect(visiblePrepSides(game)).toEqual([0]);
    ready(game);
    expect(visiblePrepSides(game)).toEqual([]);
    confirmHandoff(game);
    expect(visiblePrepSides(game)).toEqual([1]);
  });

  it('hides the other player’s gold, and both while the handoff screen shows', () => {
    const game = local();
    game.players[0].econ.gold = 11;
    game.players[1].econ.gold = 22;
    const gold = (): (number | null)[] => scoreboardView(game).map((c) => c.gold);
    expect(gold()).toEqual([null, null]);
    confirmHandoff(game);
    expect(gold()).toEqual([11, null]);
    ready(game);
    expect(gold()).toEqual([null, null]);
    confirmHandoff(game);
    expect(gold()).toEqual([null, 22]);
  });

  it('gives the dock (shop, bench, gold) of the acting player only, and locks it during handoff', () => {
    const game = local();
    confirmHandoff(game);
    const first = dockView(game, null);
    expect(first).toMatchObject({ side: 0, enabled: true, gold: game.players[0].econ.gold });
    ready(game);
    const between = dockView(game, null);
    expect(between.enabled).toBe(false);
    expect(overlayView(game, SHOWN)?.kind).toBe('handoff');
    confirmHandoff(game);
    expect(dockView(game, null)).toMatchObject({ side: 1, enabled: true });
  });
});

describe('round flow', () => {
  it('shows a handoff before every prep, for both players, in every round', () => {
    const game = local();
    for (let round = 1; round <= ROUNDS && game.phase !== 'over'; round++) {
      expect(overlayView(game, SHOWN), `round ${String(round)} start`).toMatchObject({
        kind: 'handoff',
        name: 'Player 1',
        round,
      });
      confirmHandoff(game);
      expect(overlayView(game, SHOWN)).toBeNull();
      ready(game);
      expect(overlayView(game, SHOWN), `round ${String(round)} second`).toMatchObject({
        kind: 'handoff',
        name: 'Player 2',
      });
      confirmHandoff(game);
      stage(game);
      ready(game);
      skipCombat(game);
      // Reset the staged pieces so ids stay unique next round.
      for (const p of game.players) p.holdings.board = p.holdings.board.filter((x) => x.id < 900);
      nextRound(game);
    }
  });

  it('cannot be double-advanced by repeated Skip, Next round or Ready presses', () => {
    const game = local();
    confirmHandoff(game);
    ready(game);
    confirmHandoff(game);
    stage(game);
    expect(ready(game)).toBe(true);
    expect(skipCombat(game)).toBe(true);
    expect(skipCombat(game)).toBe(false);
    expect(stepCombat(game)).toBe(false);
    expect(ready(game)).toBe(false);
    expect(confirmHandoff(game)).toBe(false);
    const result = game.result;
    expect(game.phase).toBe('result');
    expect(nextRound(game)).toBe(true);
    expect(nextRound(game)).toBe(false);
    expect(game.round).toBe(2);
    expect(game.result === result).toBe(false);
    // A second Ready press during the handoff does nothing either.
    expect(ready(game)).toBe(false);
    expect(game.phase).toBe('handoff');
  });

  it('does not double-charge a fight when Skip is pressed after stepping', () => {
    const game = local();
    confirmHandoff(game);
    ready(game);
    confirmHandoff(game);
    stage(game);
    ready(game);
    for (let i = 0; i < 3; i++) stepCombat(game);
    skipCombat(game);
    expect(game.players[1].hp).toBeLessThan(game.players[0].hp);
    const hp = game.players.map((p) => p.hp);
    skipCombat(game);
    expect(game.players.map((p) => p.hp)).toEqual(hp);
  });
});

describe('playback controls', () => {
  it('speed changes and Skip never leave the clock stuck or double-advance', () => {
    const game = local();
    confirmHandoff(game);
    ready(game);
    confirmHandoff(game);
    stage(game);
    ready(game);
    const battle = game.battle;
    expect(battle).not.toBeNull();
    if (!battle) return;
    const playback = createPlayback();
    for (const speed of BATTLE.speeds) {
      setSpeed(playback, speed);
      advancePlayback(playback, BATTLE.tickMs, battle, () => stepCombat(game));
    }
    expect(playback.time).toBeGreaterThan(0);
    skipCombat(game);
    skipPlayback(playback, battle);
    expect(playbackDone(playback, battle)).toBe(true);
    // Advancing after the end holds the clock at the end and steps nothing.
    const tick = battle.tick;
    advancePlayback(playback, BATTLE.tickMs * BATTLE.speeds.length, battle, () => stepCombat(game));
    expect(battle.tick).toBe(tick);
    expect(playbackDone(playback, battle)).toBe(true);
    expect(overlayView(game, { started: true, animationDone: false })).toBeNull();
    expect(overlayView(game, SHOWN)?.kind).toBe('result');
  });
});

describe('game over', () => {
  function fightTo(game: GameState): void {
    confirmHandoff(game);
    ready(game);
    confirmHandoff(game);
    stage(game);
    ready(game);
    skipCombat(game);
  }

  it('ends on 0 HP for player 1, player 2, or both', () => {
    const one = local();
    one.players[1].hp = 1;
    fightTo(one);
    nextRound(one);
    expect(one).toMatchObject({ phase: 'over', gameWinner: 0 });

    const two = local();
    two.players[0].hp = 1;
    confirmHandoff(two);
    ready(two);
    confirmHandoff(two);
    two.players[0].holdings.board.push({ id: 900, type: 'P', stars: 1, x: 1, y: 3 });
    two.players[1].holdings.board.push({ id: 901, type: 'Q', stars: 3, x: 14, y: 3 });
    ready(two);
    skipCombat(two);
    nextRound(two);
    expect(two).toMatchObject({ phase: 'over', gameWinner: 1 });

    const both = local();
    both.players[0].hp = FIGHT_DAMAGE.drawDamage;
    both.players[1].hp = FIGHT_DAMAGE.drawDamage;
    confirmHandoff(both);
    ready(both);
    confirmHandoff(both);
    ready(both);
    skipCombat(both);
    nextRound(both);
    expect(both).toMatchObject({ phase: 'over', gameWinner: null });
    expect(overlayView(both, SHOWN)).toMatchObject({ kind: 'over' });
  });

  it('never goes below 0 HP and cannot be restarted from the game-over screen', () => {
    const game = local();
    game.players[1].hp = 1;
    fightTo(game);
    nextRound(game);
    expect(game.players[1].hp).toBe(0);
    const round = game.round;
    expect(nextRound(game)).toBe(false);
    expect(ready(game)).toBe(false);
    expect(game.round).toBe(round);
  });
});
