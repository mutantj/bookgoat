// The first battle teaches the mechanics one step at a time. Its board and the letters that drop in are
// fixed, so each step's word is always on the board. After the last step it's an ordinary battle.
/** The opening board, top row first. */
export const TUTORIAL_BOARD = ['CATE', 'HORL', 'INSE', 'DAMP'];

/**
 * Letters for the tiles that drop in during the scripted words, in the order they're made: column by
 * column from the left, top down. A trailing * makes that tile the gem a long word leaves behind.
 * After they run out, letters are random again.
 */
export const TUTORIAL_REFILLS = ['A', 'O', 'R', 'T', 'S', 'U', 'G*', 'E'];

export type TutorialStep =
  /** Spell a word. With `word`, only that word is accepted and it's highlighted on the board. */
  | { say: string; action: 'word'; word?: string }
  | { say: string; action: 'scramble' };

export const TUTORIAL: TutorialStep[] = [
  { action: 'word', word: 'cat', say: "Let's practise on this hay dummy! Tap letters anywhere to spell CAT, then press Attack." },
  { action: 'word', word: 'horse', say: 'Ouch! It hits back after every word. Longer words hit much harder: spell HORSE.' },
  { action: 'word', word: 'goat', say: 'Long words leave a gem tile, and gems add bonus damage. Spell GOAT using the gem.' },
  { action: 'scramble', say: 'Stuck for words? Scramble gives all new letters, but the enemy gets a free hit. Try it.' },
  { action: 'word', say: 'Now attack with any word you like.' },
];

export const TUTORIAL_DONE = "That's everything! Finish it off: damage past its last bit of health heals me. Then beat the trolls on the Tower Road for a treasure!";
