/**
 * Shared simulation types.
 *
 * Only the identifiers that balance data depends on live here for now.
 * Piece, Unit, Player, GameState and BattleState arrive with the board,
 * battle and round-flow tickets.
 */

/** Piece type keys, matching algebraic chess notation letters. */
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q';

/** Star (upgrade) level. Three copies of a star level merge into the next. */
export type StarLevel = 1 | 2 | 3;

/** Star levels that unlock an ability. */
export type AbilityStar = Exclude<StarLevel, 1>;

/** Shop tier. Higher tiers appear more often at higher player levels. */
export type Tier = 1 | 2 | 3 | 4;

/** Player level. Sets the number of pieces allowed on the board. */
export type Level = 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Levels a player can still gain XP from (everything below the cap). */
export type LevellingLevel = 2 | 3 | 4 | 5 | 6 | 7;

/** Player side. 0 is Ivory (left board), 1 is Ebony (right board). */
export type Side = 0 | 1;
