import { describe, expect, it } from 'vitest';

import { FIGHT_DAMAGE } from '@sim/data.ts';
import { confirmHandoff, createGame, nextRound, ready, skipCombat } from '@sim/game.ts';
import type { GameMode, GameState } from '@sim/game.ts';
import { overlayView, visiblePrepSides } from '../src/ui/overlays-model.ts';

const SEED = 3;
const DONE = { started: true, animationDone: true };

function newGame(mode: GameMode): GameState {
  return createGame({ mode, seed: SEED });
}

/** Put one piece per side on the boards so a fight has a winner. */
function stage(game: GameState, ivoryStars: 1 | 2 | 3, ebonyStars: 1 | 2 | 3): void {
  game.players[0].holdings.board.push({ id: 900, type: 'Q', stars: ivoryStars, x: 1, y: 3 });
  game.players[1].holdings.board.push({ id: 901, type: 'P', stars: ebonyStars, x: 14, y: 3 });
}

function fight(game: GameState): void {
  if (game.mode === 'local') {
    confirmHandoff(game);
    ready(game);
    confirmHandoff(game);
  }
  ready(game);
  skipCombat(game);
}

describe('overlayView', () => {
  it('shows the start screen until a mode is chosen', () => {
    const game = newGame('ai');
    expect(overlayView(game, { started: false, animationDone: true })).toEqual({
      kind: 'start',
      canContinue: false,
    });
    expect(overlayView(game, { started: false, animationDone: true, canContinue: true })).toEqual({
      kind: 'start',
      canContinue: true,
    });
    expect(overlayView(game, DONE)).toBeNull();
  });

  it('shows the handoff before each hot-seat prep, naming who takes the screen', () => {
    const game = newGame('local');
    expect(overlayView(game, DONE)).toMatchObject({
      kind: 'handoff',
      name: 'Player 1',
      otherName: 'Player 2',
    });
    confirmHandoff(game);
    expect(overlayView(game, DONE)).toBeNull();
    ready(game);
    expect(overlayView(game, DONE)).toMatchObject({ kind: 'handoff', name: 'Player 2' });
  });

  it('breaks down the loser’s damage on the round result', () => {
    const game = newGame('ai');
    stage(game, 3, 1);
    fight(game);
    const view = overlayView(game, DONE);
    expect(view?.kind).toBe('result');
    if (view?.kind !== 'result' || !game.result) throw new Error('no result');
    expect(view.title).toBe('Round won by You');
    expect(view.subtitle).toBe('Round 1');
    expect(view.lines.join(' ')).toContain(`${String(game.result.damage[1])} HP`);
    expect(view.lines.join(' ')).toContain(`${String(FIGHT_DAMAGE.lossBase)} base`);
    expect(view.lines.join(' ')).toContain(`${String(game.result.survivingStars)} surviving star`);
  });

  it('waits for the animation before showing the result', () => {
    const game = newGame('ai');
    stage(game, 3, 1);
    fight(game);
    expect(overlayView(game, { started: true, animationDone: false })).toBeNull();
  });

  it('reports a draw with the draw damage', () => {
    const game = newGame('ai');
    fight(game);
    const view = overlayView(game, DONE);
    expect(view).toMatchObject({ kind: 'result', title: 'Draw' });
    expect(view?.kind === 'result' && view.lines[0]).toContain(String(FIGHT_DAMAGE.drawDamage));
  });

  it('shows game over with New war once a commander falls', () => {
    const game = newGame('ai');
    stage(game, 3, 1);
    game.players[1].hp = 1;
    fight(game);
    nextRound(game);
    expect(overlayView(game, DONE)).toEqual({
      kind: 'over',
      title: 'War won by You',
      subtitle: 'after 1 round',
      button: 'New war',
    });
  });
});

describe('visiblePrepSides', () => {
  it('fogs the AI board and shows only the human side vs the AI', () => {
    expect(visiblePrepSides(newGame('ai'))).toEqual([0]);
  });

  it('shows no board during handoff and only the active player’s during hot-seat prep', () => {
    const game = newGame('local');
    expect(visiblePrepSides(game)).toEqual([]);
    confirmHandoff(game);
    expect(visiblePrepSides(game)).toEqual([0]);
    ready(game);
    expect(visiblePrepSides(game)).toEqual([]);
    confirmHandoff(game);
    expect(visiblePrepSides(game)).toEqual([1]);
  });
});
