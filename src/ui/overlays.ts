/**
 * DOM overlays: start screen, hot-seat handoff, round result, game over.
 *
 * Renders an `OverlayView` and reports button presses; the handoff overlay is
 * opaque so the previous player's shop and board cannot be read behind it.
 */
import type { GameMode } from '@sim/game.ts';
import logoMark from '../../assets/brand/logo-mark.svg?url';
import type { OverlayView } from './overlays-model.ts';

export interface OverlayActions {
  start: (mode: GameMode) => void;
  startOnline: () => void;
  onlineCreate: (name: string) => void;
  onlineJoin: (name: string, code: string) => void;
  onlineReady: () => void;
  /** Leave the online screens and go back to the start screen. */
  onlineLeave: () => void;
  continueSaved: () => void;
  confirmHandoff: () => void;
  nextRound: () => void;
  newWar: () => void;
}

export interface Overlays {
  show: (view: OverlayView | null) => void;
}

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

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = el('button', primary ? 'primary' : undefined, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** The Chess War mark as a decorative image (the heading beside it names the game). */
function logo(className: string): HTMLImageElement {
  const img = el('img', className);
  img.src = logoMark;
  img.alt = '';
  img.draggable = false;
  return img;
}

function onlineMenu(error: string | null, actions: OverlayActions): HTMLElement[] {
  const name = el('input');
  name.type = 'text';
  name.maxLength = 20;
  name.placeholder = 'Your name';
  name.setAttribute('aria-label', 'Your name');
  const code = el('input');
  code.type = 'text';
  code.maxLength = 8;
  code.placeholder = 'Room code';
  code.setAttribute('aria-label', 'Room code');
  code.autocapitalize = 'characters';
  const nodes: HTMLElement[] = [el('h2', undefined, 'Play online'), name];
  if (error) nodes.push(el('p', 'muted', error));
  nodes.push(
    button(
      'Create room',
      () => {
        actions.onlineCreate(name.value);
      },
      true,
    ),
    code,
    button('Join room', () => {
      actions.onlineJoin(name.value, code.value);
    }),
    button('Back', actions.onlineLeave),
  );
  return nodes;
}

function boxFor(view: OverlayView, actions: OverlayActions): HTMLElement {
  const box = el('div', 'box');
  switch (view.kind) {
    case 'start':
      box.classList.add('start');
      box.append(
        logo('logo'),
        el('h2', 'wordmark', 'Chess War'),
        el('p', undefined, 'An auto-battler played with real chess pieces.'),
        button(
          'Play vs AI',
          () => {
            actions.start('ai');
          },
          true,
        ),
        button('2 players on one screen', () => {
          actions.start('local');
        }),
        button('Play online', actions.startOnline),
      );
      if (view.canContinue) box.append(button('Continue saved war', actions.continueSaved));
      break;
    case 'online-menu':
      box.append(...onlineMenu(view.error, actions));
      break;
    case 'online-lobby': {
      const readyButton = button(
        view.youReady ? 'Waiting for opponent…' : 'Ready',
        actions.onlineReady,
        true,
      );
      readyButton.disabled = view.youReady || view.seats[0] === null || view.seats[1] === null;
      box.append(
        el('h2', undefined, `Room ${view.room}`),
        el('p', undefined, 'Share this code with your opponent.'),
        ...view.seats.map((seat, i) =>
          el(
            'p',
            seat?.connected === false ? 'muted' : undefined,
            seat
              ? `${seat.name}${seat.ready ? ' — ready' : ''}${seat.connected ? '' : ' (away)'}`
              : `Seat ${String(i + 1)}: waiting for a player…`,
          ),
        ),
        readyButton,
        button('Leave', actions.onlineLeave),
      );
      break;
    }
    case 'online-status':
      box.append(
        el('h2', undefined, view.title),
        el('p', undefined, view.subtitle),
        button(view.button, actions.onlineLeave, true),
      );
      break;
    case 'handoff':
      box.classList.add('handoff');
      box.append(
        logo('logo small'),
        el('h2', undefined, `Pass to ${view.name}`),
        el('p', undefined, `Round ${String(view.round)}. ${view.otherName}, look away.`),
        button(`I am ${view.name}`, actions.confirmHandoff, true),
      );
      break;
    case 'result':
      box.classList.add('outcome', `tone-${view.tone}`);
      box.append(el('h2', undefined, view.title), el('p', 'muted', view.subtitle));
      for (const line of view.lines) box.append(el('p', undefined, line));
      box.append(button(view.button, actions.nextRound, true));
      break;
    case 'over':
      box.classList.add('outcome', 'final', `tone-${view.tone}`);
      box.append(
        el('h2', undefined, view.title),
        el('p', undefined, view.subtitle),
        button(view.button, actions.newWar, true),
      );
      break;
  }
  return box;
}

export function createOverlays(root: HTMLElement, actions: OverlayActions): Overlays {
  const layer = el('div', 'overlay');
  layer.hidden = true;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  root.append(layer);
  let shown: string | null = null;

  return {
    show(view) {
      if (!view) {
        layer.hidden = true;
        layer.replaceChildren();
        shown = null;
        return;
      }
      // Re-render only when the content changes so button focus is not lost every frame.
      const key = JSON.stringify(view);
      if (key === shown) return;
      shown = key;
      layer.hidden = false;
      layer.classList.toggle(
        'opaque',
        view.kind === 'handoff' || view.kind === 'start' || view.kind === 'online-menu',
      );
      layer.replaceChildren(boxFor(view, actions));
      // Keep the cursor in a text field the player is typing in; otherwise focus the first button.
      (layer.querySelector('input') ?? layer.querySelector('button'))?.focus();
    },
  };
}
