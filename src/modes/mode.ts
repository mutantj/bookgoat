import enableText from '../data/enable1.txt?raw';
import bonusText from '../data/bonus.txt?raw';
import { dictionaryFromText, wordsFromText } from '../engine/dictionary';
import { Game, type GameState, type TurnResult } from '../engine/game';

export type ModeId = 'classic' | 'blitz';
export type EndReason = 'fire' | 'time';

const dict = dictionaryFromText(enableText);
const bonusWords = wordsFromText(bonusText);

export function freshGame(gemLengthBonus = 0) {
  return new Game(dict, bonusWords, (Math.random() * 2 ** 32) >>> 0, gemLengthBonus);
}
export const resumeGame = (saved: GameState) => new Game(dict, bonusWords, saved);

/** What a mode can ask of the game screen. */
export interface ModeHost {
  readonly game: Game;
  say(html: string): void;
  clearSelection(): void;
  showGameOver(reason: EndReason): void;
}

/** One way to play: how a game starts and ends, and any rules on top of the shared engine. */
export interface GameMode {
  id: ModeId;
  /** Shown in the HUD chip. */
  name: string;
  /** Heading for the high score list, e.g. "Best games on this device". */
  scoresLabel: string;
  bestTitle: string;
  /** A line for How to play, if the mode has rules of its own. */
  help?: string;
  /** The game to play when entering the mode from the home screen. */
  enter(): Game;
  /** A brand-new game, for New game and Play again. */
  restart(): Game;
  /** Called once the board is in view. */
  begin(): void;
  /** Stop any timers: leaving the mode, or the game is over. */
  stop(): void;
  /** False while the mode is holding the board, e.g. before Blitz's clock starts. */
  canPlay(): boolean;
  /** Save the game in progress, or clear the save with null. */
  save(game: Game | null): void;
  /** React to a word; returns extra text for the level-up message. */
  afterTurn(res: TurnResult): string;
  /** The sentence under the final score. */
  summary(game: Game, reason: EndReason): string;
}

export const wordsFed = (game: Game) => {
  const n = game.state.wordsPlayed;
  return `fed Rapunzel ${n} word${n === 1 ? '' : 's'}`;
};
