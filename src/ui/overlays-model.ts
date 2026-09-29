/**
 * What the full-screen overlays say, and which boards may be seen.
 *
 * Pure functions of the game state, so the privacy rules of hot-seat play and
 * the wording of the result screens are unit-testable. `overlays.ts` renders
 * the result.
 */
import { FIGHT_DAMAGE } from '@sim/data.ts';
import type { GameState } from '@sim/game.ts';
import type { Side } from '@sim/types.ts';
import { DEMO_ROUNDS } from './demo-model.ts';
import type { OnlineOverlay } from './online-model.ts';

/** How a result screen should feel to the person looking at it. */
export type ResultTone = 'win' | 'lose' | 'draw';

export type OverlayView =
  | OnlineOverlay
  | {
      readonly kind: 'start';
      readonly canContinue: boolean;
      readonly notice?: string;
      /** The demo start screen offers only the vs-AI slice. */
      readonly demo?: boolean;
    }
  | {
      readonly kind: 'demo-end';
      readonly title: string;
      readonly subtitle: string;
      readonly tone: ResultTone;
    }
  | {
      readonly kind: 'handoff';
      readonly round: number;
      /** The player who takes the screen next. */
      readonly name: string;
      /** The player who must look away. */
      readonly otherName: string;
    }
  | {
      readonly kind: 'result';
      readonly title: string;
      readonly subtitle: string;
      readonly lines: readonly string[];
      readonly button: string;
      readonly tone: ResultTone;
    }
  | {
      readonly kind: 'over';
      readonly title: string;
      readonly subtitle: string;
      readonly button: string;
      readonly tone: ResultTone;
    };

export interface OverlayContext {
  /** False until a mode has been chosen on the start screen. */
  readonly started: boolean;
  /** The fight animation has finished playing, so its result may show. */
  readonly animationDone: boolean;
  /** A saved match is available to resume. */
  readonly canContinue?: boolean;
  /** A note for the start screen, e.g. that a damaged save was discarded. */
  readonly notice?: string;
  /** The page was opened with `?demo`. */
  readonly demo?: boolean;
  /** Demo only: the player has dismissed the last result. */
  readonly demoDone?: boolean;
}

function otherSide(side: Side): Side {
  return side === 0 ? 1 : 0;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Win, lose or draw for the viewer. Against the AI the viewer is Player 1;
 * with two people on one screen the screen shows the winner's triumph.
 */
function toneOf(game: GameState, winner: Side | null): ResultTone {
  if (winner === null) return 'draw';
  return game.mode === 'ai' && winner === 1 ? 'lose' : 'win';
}

/** The overlay to show, or null when the board and HUD are in play. */
export function overlayView(game: GameState, context: OverlayContext): OverlayView | null {
  if (!context.started) {
    return {
      kind: 'start',
      canContinue: context.canContinue === true && context.demo !== true,
      ...(context.demo ? { demo: true } : {}),
      ...(context.notice ? { notice: context.notice } : {}),
    };
  }

  if (context.demo && (context.demoDone || game.phase === 'over')) {
    const winner = game.gameWinner === null ? null : game.players[game.gameWinner].name;
    const fell = game.phase === 'over';
    return {
      kind: 'demo-end',
      title: fell
        ? winner === null
          ? 'Mutual destruction'
          : `War won by ${winner}`
        : 'Demo complete',
      subtitle: `${plural(fell ? game.round : DEMO_ROUNDS, 'round')} played. The full game runs until a commander falls, and adds 2 player and online modes.`,
      tone: fell ? toneOf(game, game.gameWinner) : 'win',
    };
  }

  if (game.phase === 'handoff') {
    return {
      kind: 'handoff',
      round: game.round,
      name: game.players[game.active].name,
      otherName: game.players[otherSide(game.active)].name,
    };
  }

  if (game.phase === 'over') {
    const winner = game.gameWinner === null ? null : game.players[game.gameWinner].name;
    return {
      kind: 'over',
      title: winner === null ? 'Mutual destruction' : `War won by ${winner}`,
      subtitle:
        winner === null ? 'Both commanders fell together.' : `after ${plural(game.round, 'round')}`,
      button: 'New war',
      tone: toneOf(game, game.gameWinner),
    };
  }

  if (game.phase === 'result' && game.result && context.animationDone) {
    const { result } = game;
    const lines: string[] = [];
    let title: string;
    if (result.winner === null) {
      title = 'Draw';
      lines.push(`Both commanders lose ${plural(FIGHT_DAMAGE.drawDamage, 'HP')}.`);
    } else {
      const winner = game.players[result.winner].name;
      const loser = game.players[otherSide(result.winner)].name;
      title = `Round won by ${winner}`;
      lines.push(
        `${loser} loses ${plural(result.damage[otherSide(result.winner)], 'HP')}:`,
        `${String(FIGHT_DAMAGE.lossBase)} base + ${plural(result.survivingStars, 'surviving star')} + ${plural(result.roundBonus, 'round bonus point')}`,
      );
    }
    if (result.byMaterial) lines.push('Decided on remaining material.');
    return {
      kind: 'result',
      title,
      subtitle: `Round ${String(result.round)}`,
      lines,
      button: context.demo && game.round >= DEMO_ROUNDS ? 'Finish demo' : 'Next round',
      tone: toneOf(game, result.winner),
    };
  }
  return null;
}

/**
 * Sides whose pieces may be drawn on the board during prep. The AI's board
 * stays fogged, and in hot-seat only the active player's own board shows (none
 * during the handoff screen).
 */
export function visiblePrepSides(game: GameState): Side[] {
  if (game.phase === 'handoff') return [];
  const sides: Side[] = [0, 1];
  return sides.filter((side) => {
    if (game.players[side].isAI) return false;
    return game.mode === 'ai' || side === game.active;
  });
}
