/**
 * Shop card frames: which classes a card carries for its tier and state.
 * Pure so the state rules are unit-testable; `theme.css` draws the frames.
 *
 * States: normal, hover (CSS only), unaffordable, bought/empty, and locked
 * (the whole shop is held for the next round).
 */
import type { ShopCardView } from './hud-model.ts';

export function tierLabel(tier: number): string {
  return `T${String(tier)}`;
}

/** CSS classes of one shop card. Tier picks the frame color; state picks the treatment. */
export function cardClasses(
  card: Pick<ShopCardView, 'tier' | 'unaffordable'>,
  locked: boolean,
): string {
  const classes = ['card', `t${String(card.tier)}`];
  if (card.unaffordable) classes.push('poor');
  if (locked) classes.push('held');
  return classes.join(' ');
}
