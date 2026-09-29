/**
 * View models for the HUD: plain data derived from the game state.
 *
 * Kept free of the DOM so the rules the HUD shows (what is hidden, what is
 * affordable, what Sell refunds) are unit-testable. `hud.ts` renders these.
 */
import {
  ECONOMY,
  PIECES,
  PLAYER,
  TIER_ODDS,
  XP_TO_NEXT_LEVEL,
  boardCap,
  sellValue,
} from '@sim/data.ts';
import type { GameState } from '@sim/game.ts';
import { countOwned } from '@sim/shop.ts';
import type { OwnedPiece } from '@sim/shop.ts';
import type { LevellingLevel, PieceType, Side, Tier } from '@sim/types.ts';
import { MERGE_COUNT } from '@sim/data.ts';

/** Streaks shorter than this are not worth showing. */
const MIN_SHOWN_STREAK = 2;
/** HP at or under this share of the starting HP turns the bar red. */
const LOW_HP_SHARE = 0.3;
const PERCENT = 100;

export interface PlayerCardView {
  readonly side: Side;
  readonly name: string;
  readonly hp: number;
  readonly hpPercent: number;
  readonly hpLow: boolean;
  /** Null when hidden from the viewer (the other player's gold during prep). */
  readonly gold: number | null;
  readonly level: number;
  /** "3/6" toward the next level, or "max". */
  readonly xpText: string;
  readonly streakText: string | null;
  readonly active: boolean;
}

/** Gold is secret while a player preps: from the opponent and from the AI's owner. */
function goldHidden(game: GameState, side: Side): boolean {
  if (game.phase === 'handoff') return true;
  return game.phase === 'prep' && game.active !== side;
}

export function scoreboardView(game: GameState): [PlayerCardView, PlayerCardView] {
  const card = (side: Side): PlayerCardView => {
    const player = game.players[side];
    const { econ } = player;
    const streak = econ.streak;
    const streakLength = Math.abs(streak);
    return {
      side,
      name: player.name,
      hp: player.hp,
      hpPercent: Math.max(0, Math.min(PERCENT, (player.hp / PLAYER.startHp) * PERCENT)),
      hpLow: player.hp <= PLAYER.startHp * LOW_HP_SHARE,
      gold: goldHidden(game, side) ? null : econ.gold,
      level: econ.level,
      xpText:
        econ.level >= PLAYER.maxLevel
          ? 'max'
          : `${String(econ.xp)}/${String(XP_TO_NEXT_LEVEL[econ.level as LevellingLevel])}`,
      streakText:
        streakLength >= MIN_SHOWN_STREAK
          ? `${String(streakLength)} ${streak > 0 ? 'win' : 'loss'} streak`
          : null,
      active: game.phase === 'prep' && game.active === side,
    };
  };
  return [card(0), card(1)];
}

export interface ShopCardView {
  readonly slot: number;
  /** Null once bought. */
  readonly type: PieceType | null;
  readonly name: string;
  readonly glyph: string;
  readonly cost: number;
  readonly tier: Tier;
  /** Copies of this piece already owned toward the next merge (0-2). */
  readonly pips: number;
  readonly enabled: boolean;
}

export interface BenchSlotView {
  readonly index: number;
  readonly piece: OwnedPiece | null;
  readonly name: string;
  readonly glyph: string;
  readonly selected: boolean;
}

export interface DockView {
  /** Is the player whose dock this is allowed to act right now? */
  readonly enabled: boolean;
  readonly side: Side;
  readonly gold: number;
  readonly oddsText: string;
  readonly cards: readonly ShopCardView[];
  readonly bench: readonly BenchSlotView[];
  readonly onBoard: number;
  readonly boardCap: number;
  readonly reroll: { readonly cost: number; readonly enabled: boolean };
  readonly lock: { readonly locked: boolean; readonly enabled: boolean };
  readonly buyXp: { readonly cost: number; readonly maxed: boolean; readonly enabled: boolean };
  /** `refund` is null when no piece is selected. */
  readonly sell: {
    readonly enabled: boolean;
    readonly refund: number | null;
    readonly pieceName: string | null;
  };
  readonly ready: { readonly label: string; readonly enabled: boolean };
}

/** Dock (shop, bench, actions) of the player whose prep it is. */
export function dockView(game: GameState, selectedPieceId: number | null): DockView {
  const side = game.active;
  const player = game.players[side];
  const { econ, holdings, shop } = player;
  const enabled = game.phase === 'prep' && !player.isAI;

  const cards = shop.slots.map((type, slot): ShopCardView => {
    if (type === null) {
      return { slot, type, name: '', glyph: '', cost: 0, tier: 1, pips: 0, enabled: false };
    }
    const def = PIECES[type];
    return {
      slot,
      type,
      name: def.name,
      glyph: def.glyph,
      cost: def.cost,
      tier: def.tier,
      pips: countOwned(holdings, type, 1) % MERGE_COUNT,
      enabled: enabled && econ.gold >= def.cost,
    };
  });

  const bench = holdings.bench.map((piece, index): BenchSlotView => ({
    index,
    piece,
    name: piece ? `${PIECES[piece.type].name} ${String(piece.stars)} star` : 'Empty bench slot',
    glyph: piece ? PIECES[piece.type].glyph : '',
    selected: piece !== null && piece.id === selectedPieceId,
  }));

  const selected =
    selectedPieceId === null
      ? undefined
      : [...holdings.board, ...holdings.bench].find((p) => p?.id === selectedPieceId);
  const maxed = econ.level >= PLAYER.maxLevel;

  return {
    enabled,
    side,
    gold: econ.gold,
    oddsText: `Odds ${TIER_ODDS[econ.level].map((o, i) => `T${String(i + 1)} ${String(o)}%`).join(' · ')}`,
    cards,
    bench,
    onBoard: holdings.board.length,
    boardCap: boardCap(econ.level),
    reroll: { cost: ECONOMY.rerollCost, enabled: enabled && econ.gold >= ECONOMY.rerollCost },
    lock: { locked: shop.locked, enabled },
    buyXp: {
      cost: ECONOMY.xpPurchaseCost,
      maxed,
      enabled: enabled && !maxed && econ.gold >= ECONOMY.xpPurchaseCost,
    },
    sell: {
      enabled: enabled && selected !== undefined,
      refund: selected ? sellValue(selected.type, selected.stars) : null,
      pieceName: selected ? PIECES[selected.type].name : null,
    },
    ready: {
      label: game.mode === 'local' && side === 0 ? 'Ready, pass to Player 2' : 'Fight',
      enabled,
    },
  };
}
