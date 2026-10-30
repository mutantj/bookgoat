import { loadGame, saveGame } from '../ui/storage';
import { freshGame, resumeGame, wordsFed, type GameMode, type ModeHost } from './mode';

/** Play until the fire reaches the bottom. The game is saved after every word so it can be continued. */
export function createClassic(host: ModeHost): GameMode {
  return {
    id: 'classic',
    name: 'Classic',
    scoresLabel: 'games',
    bestTitle: 'New best game!',

    enter() {
      const saved = loadGame();
      let game = freshGame();
      if (saved && !saved.gameOver) {
        try {
          game = resumeGame(saved);
        } catch {
          /* corrupt save — start fresh */
        }
      }
      host.say(game.state.wordsPlayed > 0 ? `Welcome back! You're on level ${game.state.level}.` : "Spell a word and I'll eat it.");
      return game;
    },
    restart() {
      saveGame(null);
      host.say("Fresh shelf of letters. Spell a word and I'll eat it.");
      return freshGame();
    },
    begin() {},
    stop() {},
    canPlay: () => true,
    save: (game) => saveGame(game?.state ?? null),
    afterTurn: () => '',
    summary: (game) => `You reached level ${game.state.level} and ${wordsFed(game)}.`,
  };
}
