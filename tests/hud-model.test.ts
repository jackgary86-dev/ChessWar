import { describe, expect, it } from 'vitest';

import { confirmHandoff, createGame, ready } from '@sim/game.ts';
import type { GameState } from '@sim/game.ts';
import { ECONOMY, PLAYER, TIER_ODDS, sellValue } from '@sim/data.ts';
import { dockView, scoreboardView } from '../src/ui/hud-model.ts';

const SEED = 5;
const STREAK = 3;

function newGame(mode: 'ai' | 'local'): GameState {
  return createGame({ mode, seed: SEED });
}

describe('scoreboardView', () => {
  it('shows hp, level and xp for both players', () => {
    const [a, b] = scoreboardView(newGame('ai'));
    expect(a.hp).toBe(PLAYER.startHp);
    expect(a.hpPercent).toBe(100);
    expect(a.level).toBe(PLAYER.startLevel);
    expect(a.xpText).toMatch(/^\d+\/\d+$/);
    expect(b.name).toBe('Iron Bot');
  });

  it('hides the other player’s gold during hot-seat prep, and both during handoff', () => {
    const game = newGame('local');
    expect(game.phase).toBe('handoff');
    let [a, b] = scoreboardView(game);
    expect([a.gold, b.gold]).toEqual([null, null]);
    confirmHandoff(game);
    [a, b] = scoreboardView(game);
    expect(a.gold).toBe(game.players[0].econ.gold);
    expect(b.gold).toBeNull();
    ready(game);
    confirmHandoff(game);
    [a, b] = scoreboardView(game);
    expect(a.gold).toBeNull();
    expect(b.gold).toBe(game.players[1].econ.gold);
  });

  it('shows the AI’s gold only outside prep', () => {
    const game = newGame('ai');
    expect(scoreboardView(game)[1].gold).toBeNull();
    ready(game);
    expect(scoreboardView(game)[1].gold).toBe(game.players[1].econ.gold);
  });

  it('reports streaks of two or more', () => {
    const game = newGame('ai');
    expect(scoreboardView(game)[0].streakText).toBeNull();
    game.players[0].econ.streak = STREAK;
    game.players[1].econ.streak = -STREAK;
    const [a, b] = scoreboardView(game);
    expect(a.streakText).toBe('3 win streak');
    expect(b.streakText).toBe('3 loss streak');
  });

  it('marks hp as low and shows max level xp', () => {
    const game = newGame('ai');
    game.players[0].hp = 5;
    game.players[0].econ.level = PLAYER.maxLevel;
    const [a] = scoreboardView(game);
    expect(a.hpLow).toBe(true);
    expect(a.xpText).toBe('max');
  });
});

describe('dockView', () => {
  it('lists five shop cards with cost, tier and affordability', () => {
    const game = newGame('ai');
    game.players[0].econ.gold = 0;
    const dock = dockView(game, null);
    expect(dock.cards).toHaveLength(PLAYER.shopSize);
    for (const card of dock.cards) {
      expect(card.cost).toBeGreaterThan(0);
      expect(card.enabled).toBe(false);
    }
    game.players[0].econ.gold = 99;
    expect(dockView(game, null).cards.every((c) => c.enabled)).toBe(true);
  });

  it('shows tier odds for the level and the board counter', () => {
    const game = newGame('ai');
    const dock = dockView(game, null);
    const odds = TIER_ODDS[PLAYER.startLevel];
    expect(dock.oddsText).toContain(`T1 ${String(odds[0])}%`);
    expect(dock.onBoard).toBe(0);
    expect(dock.boardCap).toBe(PLAYER.startLevel);
    expect(dock.bench).toHaveLength(PLAYER.benchSize);
  });

  it('counts pips as copies owned toward the next merge', () => {
    const game = newGame('ai');
    const holdings = game.players[0].holdings;
    const type = game.players[0].shop.slots.find((s) => s !== null);
    if (type === undefined) throw new Error('empty shop');
    holdings.bench[0] = { id: 100, type, stars: 1 };
    holdings.bench[1] = { id: 101, type, stars: 1 };
    const card = dockView(game, null).cards.find((c) => c.type === type);
    expect(card?.pips).toBe(2);
  });

  it('gates the action buttons on gold and level', () => {
    const game = newGame('ai');
    const econ = game.players[0].econ;
    econ.gold = ECONOMY.rerollCost - 1;
    let dock = dockView(game, null);
    expect(dock.reroll.enabled).toBe(false);
    expect(dock.buyXp.enabled).toBe(false);
    econ.gold = ECONOMY.xpPurchaseCost;
    dock = dockView(game, null);
    expect(dock.reroll.enabled).toBe(true);
    expect(dock.buyXp.enabled).toBe(true);
    econ.level = PLAYER.maxLevel;
    dock = dockView(game, null);
    expect(dock.buyXp.maxed).toBe(true);
    expect(dock.buyXp.enabled).toBe(false);
  });

  it('shows the refund of the selected piece on Sell', () => {
    const game = newGame('ai');
    const holdings = game.players[0].holdings;
    holdings.bench[0] = { id: 200, type: 'R', stars: 2 };
    expect(dockView(game, null).sell).toEqual({ enabled: false, refund: null, pieceName: null });
    const dock = dockView(game, 200);
    expect(dock.sell.enabled).toBe(true);
    expect(dock.sell.refund).toBe(sellValue('R', 2));
    expect(dock.bench[0]?.selected).toBe(true);
  });

  it('disables everything outside the human’s prep and labels Ready per mode', () => {
    const ai = newGame('ai');
    expect(dockView(ai, null).ready).toEqual({ label: 'Fight', enabled: true });
    ready(ai);
    expect(dockView(ai, null).ready.enabled).toBe(false);
    expect(dockView(ai, null).lock.enabled).toBe(false);

    const local = newGame('local');
    expect(dockView(local, null).ready.enabled).toBe(false);
    confirmHandoff(local);
    expect(dockView(local, null).ready.label).toBe('Ready, pass to Player 2');
    ready(local);
    confirmHandoff(local);
    expect(dockView(local, null).ready.label).toBe('Fight');
    expect(dockView(local, null).side).toBe(1);
  });
});
