/**
 * DOM panels: the battle log and the field manual.
 */
import { fieldManual } from './log-model.ts';
import type { LogLine } from './log-model.ts';

const MAX_LINES = 120;

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

export interface LogPanel {
  add: (lines: readonly LogLine[]) => void;
  clear: () => void;
}

/** A scrolling battle log; new lines are appended and the view follows them. */
export function createLogPanel(root: HTMLElement): LogPanel {
  const wrap = el('section', 'logpanel');
  wrap.append(el('div', 'label', 'Battle log'));
  const list = el('div', 'log');
  list.setAttribute('role', 'log');
  list.setAttribute('aria-live', 'polite');
  wrap.append(list);
  root.append(wrap);

  return {
    add(lines) {
      for (const line of lines) {
        const row = el('div', `logline ${line.tone}`, line.text);
        if (line.side !== undefined) row.dataset.side = String(line.side);
        list.append(row);
      }
      while (list.children.length > MAX_LINES) list.firstElementChild?.remove();
      list.scrollTop = list.scrollHeight;
    },
    clear() {
      list.replaceChildren();
    },
  };
}

/** The field manual: every piece's cost, stats, movement and star ability. */
export function createFieldManual(root: HTMLElement): void {
  const details = el('details', 'manual');
  details.append(el('summary', undefined, 'Field manual'));
  for (const entry of fieldManual()) {
    const card = el('article', `manual-entry t${String(entry.tier)}`);
    card.append(
      el(
        'h3',
        undefined,
        `${entry.glyph}︎ ${entry.name} · ${String(entry.cost)}g · tier ${String(entry.tier)}`,
      ),
    );
    const facts = el('dl');
    const rows: readonly (readonly [string, string])[] = [
      ['HP 1★/2★/3★', entry.hp],
      ['ATK 1★/2★/3★', entry.atk],
      ['Speed', entry.speed],
      ['Moves', entry.movement],
      ['Strikes', entry.strike],
    ];
    for (const [term, value] of rows) {
      facts.append(el('dt', undefined, term), el('dd', undefined, value));
    }
    card.append(facts, el('p', 'ability', entry.ability));
    details.append(card);
  }
  root.append(details);
}
