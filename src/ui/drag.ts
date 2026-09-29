/**
 * Drag-and-drop placement with pointer events (mouse, pen and touch).
 *
 * Press a piece on the bench or your board, move past a small threshold to
 * start a drag (a ghost piece follows the pointer and the square or bench slot
 * under it lights up), release to drop. A press that never moves is left to
 * the tap-to-place handlers, which stay the fallback.
 *
 * `applyDrop` and `exceedsDragThreshold` are pure; `attachDrag` is the DOM
 * wiring.
 */
import type { Pos } from '@sim/board.ts';
import type { GameState } from '@sim/game.ts';
import type { Side } from '@sim/types.ts';
import { tapBenchSlot, tapSquare } from './input.ts';
import type { Selection, TapResult } from './input.ts';
import type { Layout } from './layout.ts';

/** How far the pointer must travel (CSS px) before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 6;

export type DropTarget =
  | { readonly kind: 'square'; readonly pos: Pos }
  | { readonly kind: 'bench'; readonly slot: number };

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
}

/** Drop a dragged piece: the same rules as tapping the source, then the target. */
export function applyDrop(
  game: GameState,
  side: Side,
  source: Selection,
  target: DropTarget,
): TapResult {
  return target.kind === 'square'
    ? tapSquare(game, side, source, target.pos)
    : tapBenchSlot(game, side, source, target.slot);
}

export interface DragOptions {
  readonly canvas: HTMLCanvasElement;
  /** Element containing the bench slots (`.slot` with `data-slot`). */
  readonly benchRoot: HTMLElement;
  readonly getLayout: () => Layout;
  /** Can pieces be moved right now? */
  readonly enabled: () => boolean;
  readonly sourceAtSquare: (pos: Pos) => Selection | null;
  readonly sourceAtBench: (slot: number) => Selection | null;
  /** Glyph shown on the ghost for a dragged piece. */
  readonly ghostGlyph: (source: Selection) => string;
  /** Called as a drag starts, so the source can be highlighted. */
  readonly onStart: (source: Selection) => void;
  /** Called as the hovered drop target changes (null when over nothing). */
  readonly onHover: (target: DropTarget | null) => void;
  readonly onDrop: (source: Selection, target: DropTarget) => void;
  /** Called when a drag ends without a valid target. */
  readonly onCancel: () => void;
}

interface Press {
  readonly source: Selection;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  ghost: HTMLElement | null;
}

function canvasPoint(canvas: HTMLCanvasElement, x: number, y: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: x - rect.left, y: y - rect.top };
}

export function attachDrag(options: DragOptions): void {
  const { canvas, benchRoot } = options;
  let press: Press | null = null;
  /** Set when a drag has just ended, so the click or tap that follows is ignored. */
  let swallowTap = false;

  const targetAt = (clientX: number, clientY: number): DropTarget | null => {
    const under = document.elementFromPoint(clientX, clientY);
    const slotEl = under?.closest<HTMLElement>('.slot');
    if (slotEl?.dataset.slot !== undefined && benchRoot.contains(slotEl)) {
      return { kind: 'bench', slot: Number(slotEl.dataset.slot) };
    }
    if (under === canvas) {
      const at = canvasPoint(canvas, clientX, clientY);
      const pos = options.getLayout().fromScreen(at.x, at.y);
      if (pos) return { kind: 'square', pos };
    }
    return null;
  };

  const begin = (source: Selection, event: PointerEvent): void => {
    press = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      ghost: null,
    };
    window.addEventListener('pointermove', move);
    // Capture phase, so the drop is decided before the canvas sees the pointerup as a tap.
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', cancel, true);
  };

  const finish = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', cancel, true);
    press?.ghost?.remove();
    press = null;
    options.onHover(null);
    for (const el of benchRoot.querySelectorAll('.drop')) el.classList.remove('drop');
  };

  function move(event: PointerEvent): void {
    if (press?.pointerId !== event.pointerId) return;
    if (!press.ghost) {
      if (!exceedsDragThreshold(event.clientX - press.startX, event.clientY - press.startY)) return;
      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.textContent = `${options.ghostGlyph(press.source)}︎`;
      document.body.append(ghost);
      press.ghost = ghost;
      options.onStart(press.source);
    }
    press.ghost.style.left = `${String(event.clientX)}px`;
    press.ghost.style.top = `${String(event.clientY)}px`;
    event.preventDefault();
    const target = targetAt(event.clientX, event.clientY);
    options.onHover(target?.kind === 'square' ? target : null);
    for (const el of benchRoot.querySelectorAll('.drop')) el.classList.remove('drop');
    if (target?.kind === 'bench') {
      benchRoot.querySelector(`.slot[data-slot="${String(target.slot)}"]`)?.classList.add('drop');
    }
  }

  function end(event: PointerEvent): void {
    if (press?.pointerId !== event.pointerId) return;
    const dragged = press.ghost !== null;
    const { source } = press;
    const target = dragged ? targetAt(event.clientX, event.clientY) : null;
    finish();
    if (!dragged) return;
    swallowTap = true;
    setTimeout(() => {
      swallowTap = false;
    }, 0);
    if (target) options.onDrop(source, target);
    else options.onCancel();
  }

  function cancel(event: PointerEvent): void {
    if (press?.pointerId !== event.pointerId) return;
    const dragged = press.ghost !== null;
    finish();
    if (dragged) options.onCancel();
  }

  // A drag that started on the bench must not also fire the slot's click, and a
  // drag that ended on the canvas must not also register as a tap.
  const swallow = (event: Event): void => {
    if (swallowTap) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  };
  benchRoot.addEventListener('click', swallow, true);
  canvas.addEventListener('pointerup', swallow, true);

  benchRoot.addEventListener('pointerdown', (event) => {
    if (!options.enabled() || event.button !== 0) return;
    const slotEl = (event.target as Element).closest<HTMLElement>('.slot.full');
    const slot = slotEl?.dataset.slot;
    if (slot === undefined) return;
    const source = options.sourceAtBench(Number(slot));
    if (source) begin(source, event);
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!options.enabled() || event.button !== 0) return;
    const at = canvasPoint(canvas, event.clientX, event.clientY);
    const pos = options.getLayout().fromScreen(at.x, at.y);
    const source = pos ? options.sourceAtSquare(pos) : null;
    if (source) begin(source, event);
  });

  // Stop the page scrolling when a touch lands on one of your pieces, so the
  // gesture can become a drag; touches elsewhere on the canvas still scroll.
  canvas.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      if (!touch || !options.enabled()) return;
      const at = canvasPoint(canvas, touch.clientX, touch.clientY);
      const pos = options.getLayout().fromScreen(at.x, at.y);
      if (pos && options.sourceAtSquare(pos)) event.preventDefault();
    },
    { passive: false },
  );
}
