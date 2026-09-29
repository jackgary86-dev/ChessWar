/**
 * DOM HUD: scoreboard, shop, bench and action buttons.
 *
 * Renders the view models from `hud-model.ts` and reports clicks through
 * `HudActions`; it never changes game state itself.
 */
import type { GameState } from '@sim/game.ts';
import { dockView, scoreboardView } from './hud-model.ts';
import type { DockView, PlayerCardView } from './hud-model.ts';
import { cardClasses, tierLabel } from './card-art.ts';
import { assetUrl, iconAssetPath } from './assets.ts';
import { pieceSpriteUrl } from './sprites.ts';

export interface HudActions {
  buy: (slot: number) => void;
  reroll: () => void;
  toggleLock: () => void;
  buyXp: () => void;
  sell: () => void;
  ready: () => void;
  /** A bench slot was tapped. */
  tapBench: (slot: number) => void;
}

/** One-shot feedback the next `update` plays: bench merges, a level-up, a shop buy. */
export interface Celebration {
  readonly benchSlots?: readonly number[];
  readonly levelUpSide?: number;
  readonly boughtSlot?: number;
}

export interface Hud {
  /** Mark feedback to play on the next `update`. */
  celebrate: (celebration: Celebration) => void;
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

/** A decorative icon from `assets/icons`, or nothing if the file is missing. */
function icon(name: string): HTMLElement | null {
  const url = assetUrl(iconAssetPath(name));
  if (url === undefined) return null;
  const node = el('span', 'ico');
  node.style.setProperty('--icon', `url("${url}")`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function button(
  label: string,
  onClick: () => void,
  enabled: boolean,
  iconName?: string,
): HTMLButtonElement {
  const b = el('button');
  const glyph = iconName === undefined ? null : icon(iconName);
  if (glyph) b.append(glyph);
  b.append(label);
  b.type = 'button';
  b.disabled = !enabled;
  b.addEventListener('click', onClick);
  return b;
}

function playerCard(view: PlayerCardView, levelUp: boolean): HTMLElement {
  const card = el('div', view.active ? 'pcard active' : 'pcard');
  if (levelUp) card.classList.add('levelup');
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

function shopRow(dock: DockView, actions: HudActions, boughtSlot: number | undefined): HTMLElement {
  const row = el('div', 'shop');
  for (const card of dock.cards) {
    if (card.type === null) {
      row.append(
        el('div', card.slot === boughtSlot ? 'card empty bought' : 'card empty', 'Bought'),
      );
      continue;
    }
    const b = el('button', cardClasses(card, dock.lock.locked));
    b.type = 'button';
    b.disabled = !card.enabled;
    b.title = `${card.name}, ${tierLabel(card.tier)}, ${String(card.cost)} gold${card.unaffordable ? ' (not enough gold)' : ''}`;
    const pips = el('span', 'pips');
    pips.title = `${String(card.pips)} of ${String(card.pipSlots)} copies owned toward a merge`;
    for (let i = 0; i < card.pipSlots; i++) pips.append(el('i', i < card.pips ? 'on' : undefined));
    const art = el('span', 'g');
    const spriteUrl = pieceSpriteUrl(card.type, dock.side);
    if (spriteUrl === undefined) {
      art.textContent = `${card.glyph}${VS_TEXT}`;
    } else {
      const img = el('img');
      img.src = spriteUrl;
      img.alt = '';
      img.draggable = false;
      // Fall back to the Unicode glyph if the sprite fails to load.
      img.addEventListener('error', () => {
        art.textContent = `${card.glyph}${VS_TEXT}`;
      });
      art.append(img);
    }
    b.append(
      el('span', 'tier', tierLabel(card.tier)),
      el('span', 'cost', String(card.cost)),
      pips,
      art,
      el('span', 'n', card.name),
    );
    b.addEventListener('click', () => {
      actions.buy(card.slot);
    });
    row.append(b);
  }
  return row;
}

function benchRow(dock: DockView, actions: HudActions, popped: readonly number[]): HTMLElement {
  const row = el('div', 'bench');
  for (const slot of dock.bench) {
    const b = el('button', slot.piece ? 'slot full' : 'slot');
    b.type = 'button';
    b.disabled = !dock.enabled;
    b.setAttribute('aria-label', slot.name);
    b.dataset.slot = String(slot.index);
    if (slot.selected) b.classList.add('sel');
    if (popped.includes(slot.index)) b.classList.add('merged');
    if (slot.piece) {
      b.append(
        el('span', 'g', `${slot.glyph}${VS_TEXT}`),
        el('span', 'st', '★'.repeat(slot.piece.stars)),
      );
      b.dataset.type = slot.piece.type;
    }
    b.addEventListener('click', () => {
      actions.tapBench(slot.index);
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
    'lock',
  );
  lock.classList.toggle('on', dock.lock.locked);
  const fight = button(dock.ready.label, actions.ready, dock.ready.enabled);
  fight.classList.add('primary');
  row.append(
    button(`Reroll ${String(dock.reroll.cost)}g`, actions.reroll, dock.reroll.enabled, 'reroll'),
    lock,
    button(xpLabel, actions.buyXp, dock.buyXp.enabled, 'xp'),
    button(sellLabel, actions.sell, dock.sell.enabled, 'sell'),
    fight,
  );
  return row;
}

/** Mount the HUD into `root`: scoreboard above, dock below. */
export function createHud(root: HTMLElement, actions: HudActions): Hud {
  const scores = el('div', 'scores');
  const dock = el('div', 'dock');
  root.append(scores, dock);

  let pending: Celebration = {};

  return {
    celebrate(celebration) {
      pending = celebration;
    },
    update(game, selectedPieceId) {
      const play = pending;
      pending = {};
      const [a, b] = scoreboardView(game);
      scores.replaceChildren(
        playerCard(a, play.levelUpSide === a.side),
        el('div', 'vs', 'VS'),
        playerCard(b, play.levelUpSide === b.side),
      );

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
        shopRow(view, actions, play.boughtSlot),
        cap,
        benchRow(view, actions, play.benchSlots ?? []),
        actionRow(view, actions),
      );
    },
  };
}
