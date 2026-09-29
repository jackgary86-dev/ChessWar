/**
 * DOM overlays: start screen, hot-seat handoff, round result, game over.
 *
 * Renders an `OverlayView` and reports button presses; the handoff overlay is
 * opaque so the previous player's shop and board cannot be read behind it.
 */
import type { GameMode } from '@sim/game.ts';
import type { OverlayView } from './overlays-model.ts';

export interface OverlayActions {
  start: (mode: GameMode) => void;
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

function boxFor(view: OverlayView, actions: OverlayActions): HTMLElement {
  const box = el('div', 'box');
  switch (view.kind) {
    case 'start':
      box.append(
        el('h2', undefined, 'Chess War'),
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
      );
      break;
    case 'handoff':
      box.append(
        el('h2', undefined, `Pass to ${view.name}`),
        el('p', undefined, `Round ${String(view.round)}. ${view.otherName}, look away.`),
        button(`I am ${view.name}`, actions.confirmHandoff, true),
      );
      break;
    case 'result':
      box.append(el('h2', undefined, view.title), el('p', 'muted', view.subtitle));
      for (const line of view.lines) box.append(el('p', undefined, line));
      box.append(button(view.button, actions.nextRound, true));
      break;
    case 'over':
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
      layer.classList.toggle('opaque', view.kind === 'handoff' || view.kind === 'start');
      layer.replaceChildren(boxFor(view, actions));
      layer.querySelector('button')?.focus();
    },
  };
}
