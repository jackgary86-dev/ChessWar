/**
 * DOM HUD: scoreboard, shop, bench and action buttons.
 *
 * Renders the view models from `hud-model.ts` and reports clicks through
 * `HudActions`; it never changes game state itself.
 */
import type { GameState } from '@sim/game.ts';
import { dockView, scoreboardView } from './hud-model.ts';
import type { DockView, PlayerCardView } from './hud-model.ts';

export interface HudActions {
  buy: (slot: number) => void;
  reroll: () => void;
  toggleLock: () => void;
  buyXp: () => void;
  sell: () => void;
  ready: () => void;
  /** A bench slot was tapped; the piece id, or null for an empty slot. */
  selectBench: (pieceId: number | null) => void;
}

export interface Hud {
  update: (game: GameState, selectedPieceId: number | null) => void;
}

const VS_TEXT = '︎';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, enabled: boolean): HTMLButtonElement {
  const b = el('button', undefined, label);
  b.type = 'button';
  b.disabled = !enabled;
  b.addEventListener('click', onClick);
  return b;
}

function playerCard(view: PlayerCardView): HTMLElement {
  const card = el('div', view.active ? 'pcard active' : 'pcard');
  const name = el('div', 'nm');
  name.append(el('span', `chip s${String(view.side)}`), el('span', 'txt', view.name));
  const bar = el('div', 'hpbar');
  bar.title = `${String(view.hp)} HP`;
  const fill = el('i', view.hpLow ? 'low' : undefined);
  fill.style.width = `${String(view.hpPercent)}%`;
  bar.append(fill);
  const stats = el('div', 'stats');
  const gold = el('span', 'gold');
  gold.append(el('b', undefined, view.gold === null ? '?' : String(view.gold)), ' gold');
  const hp = el('span');
  hp.append(el('b', undefined, String(view.hp)), ' HP');
  const level = el('span');
  level.append('Lv ', el('b', undefined, String(view.level)), ` ${view.xpText} xp`);
  stats.append(hp, gold, level);
  if (view.streakText) stats.append(el('span', undefined, view.streakText));
  card.append(name, bar, stats);
  return card;
}

function shopRow(dock: DockView, actions: HudActions): HTMLElement {
  const row = el('div', 'shop');
  for (const card of dock.cards) {
    if (card.type === null) {
      row.append(el('div', 'card empty', 'Bought'));
      continue;
    }
    const b = el('button', `card t${String(card.tier)}`);
    b.type = 'button';
    b.disabled = !card.enabled;
    b.title = card.name;
    if (card.pips > 0) {
      const pips = el('span', 'pips');
      for (let i = 0; i < card.pips; i++) pips.append(el('i'));
      b.append(pips);
    }
    b.append(
      el('span', 'g', `${card.glyph}${VS_TEXT}`),
      el('span', 'n', card.name),
      el('span', 'c', `${String(card.cost)}g`),
    );
    b.addEventListener('click', () => {
      actions.buy(card.slot);
    });
    row.append(b);
  }
  return row;
}

function benchRow(dock: DockView, actions: HudActions): HTMLElement {
  const row = el('div', 'bench');
  for (const slot of dock.bench) {
    const b = el('button', slot.piece ? 'slot full' : 'slot');
    b.type = 'button';
    b.disabled = !dock.enabled;
    b.setAttribute('aria-label', slot.name);
    if (slot.selected) b.classList.add('sel');
    if (slot.piece) {
      b.append(
        el('span', 'g', `${slot.glyph}${VS_TEXT}`),
        el('span', 'st', '★'.repeat(slot.piece.stars)),
      );
      b.dataset.type = slot.piece.type;
    }
    b.addEventListener('click', () => {
      actions.selectBench(slot.piece?.id ?? null);
    });
    row.append(b);
  }
  return row;
}

function actionRow(dock: DockView, actions: HudActions): HTMLElement {
  const row = el('div', 'actions');
  const sellLabel =
    dock.sell.refund === null
      ? 'Sell'
      : `Sell ${dock.sell.pieceName ?? ''} +${String(dock.sell.refund)}g`;
  const xpLabel = dock.buyXp.maxed ? 'Max level' : `Buy XP ${String(dock.buyXp.cost)}g`;
  const lock = button(
    dock.lock.locked ? 'Shop locked' : 'Lock shop',
    actions.toggleLock,
    dock.lock.enabled,
  );
  lock.classList.toggle('on', dock.lock.locked);
  const fight = button(dock.ready.label, actions.ready, dock.ready.enabled);
  fight.classList.add('primary');
  row.append(
    button(`Reroll ${String(dock.reroll.cost)}g`, actions.reroll, dock.reroll.enabled),
    lock,
    button(xpLabel, actions.buyXp, dock.buyXp.enabled),
    button(sellLabel, actions.sell, dock.sell.enabled),
    fight,
  );
  return row;
}

/** Mount the HUD into `root`: scoreboard above, dock below. */
export function createHud(root: HTMLElement, actions: HudActions): Hud {
  const scores = el('div', 'scores');
  const dock = el('div', 'dock');
  root.append(scores, dock);

  return {
    update(game, selectedPieceId) {
      const [a, b] = scoreboardView(game);
      scores.replaceChildren(playerCard(a), el('div', 'vs', 'VS'), playerCard(b));

      const view = dockView(game, selectedPieceId);
      const head = el('div', 'dockhead');
      const shopLabel = el('span', 'label');
      shopLabel.append(
        'Shop',
        view.enabled ? ' · ' : '',
        view.enabled ? el('b', undefined, `${String(view.gold)} gold`) : '',
      );
      head.append(shopLabel, el('span', 'label', view.oddsText));
      const cap = el('div', 'label');
      cap.append(
        'On board ',
        el('b', undefined, `${String(view.onBoard)}/${String(view.boardCap)}`),
      );
      dock.classList.toggle('off', !view.enabled);
      dock.replaceChildren(
        head,
        shopRow(view, actions),
        cap,
        benchRow(view, actions),
        actionRow(view, actions),
      );
    },
  };
}
