import { describe, expect, it } from 'vitest';
import type { Tile } from '../engine/board';
import { dict } from '../modes/mode';
import { ENEMIES } from './enemies';
import { damageFor, makeBoard, refill, tilesFor, type Board } from './rules';
import { TUTORIAL, TUTORIAL_BOARD, TUTORIAL_REFILLS } from './tutorial';
import { TUNING, gemForLength } from './tuning';

let nextId = 1;
const tile = (letter = 'X', kind: Tile['kind'] = 'normal'): Tile => ({ id: nextId++, letter, kind });
const letters = (board: Board) => board.map((col) => col.map((t) => t.letter).join(''));
const dummy = ENEMIES.find((e) => e.tutorial)!;

describe('adventure board', () => {
  it('spells a word from tiles anywhere on the board, preferring gems', () => {
    const board = makeBoard(() => tile(), ['GXXX', 'XXXO', 'XXXX', 'AXXT']);
    board[2][2] = tile('G', 'green');
    const tiles = tilesFor(board, 'goat')!;
    expect(tiles.map((p) => board[p.c][p.r].letter).join('')).toBe('GOAT');
    expect(board[tiles[0].c][tiles[0].r].kind).toBe('green');
    expect(tilesFor(board, 'goats')).toBeNull();
  });

  it('removes used tiles, drops the rest down and fills from the top', () => {
    const board = makeBoard(() => tile(), ['ABCD', 'EFGH', 'IJKL', 'MNOP']);
    const created = refill(board, [{ c: 0, r: 3 }, { c: 0, r: 1 }, { c: 2, r: 0 }], () => tile('Z'));
    expect(created).toHaveLength(3);
    expect(letters(board)).toEqual(['ZZAI', 'BFJN', 'ZGKO', 'DHLP']);
  });

  it('multiplies letters by length, gems and the braid', () => {
    const word = [tile('G', 'green'), tile('O'), tile('A'), tile('T')];
    const base = 4 * TUNING.lengthMultiplier[4];
    expect(damageFor(word, dummy, false).total).toBe(Math.round(base * TUNING.gemMultiplier.green));
    expect(damageFor(word, dummy, true).total).toBe(Math.round(base * TUNING.gemMultiplier.green * TUNING.powerUps.braid.multiplier));
  });

  it('lets enemy powers change the damage', () => {
    const moss = ENEMIES.find((e) => e.name === 'Moss Troll')!;
    const cat = [tile('C'), tile('A'), tile('T')];
    expect(damageFor(cat, moss, false).total).toBe(damageFor(cat, dummy, false).total - 1);
  });
});

describe('tutorial script', () => {
  it('always has the letters for each word step, and GOAT gets the gem', () => {
    const refills = [...TUTORIAL_REFILLS];
    const make = () => {
      const s = refills.shift() ?? 'X';
      return tile(s.replace('*', ''), s.endsWith('*') ? 'green' : 'normal');
    };
    const board = makeBoard(() => tile(), TUTORIAL_BOARD);
    for (const step of TUTORIAL) {
      if (step.action !== 'word' || !step.word) continue;
      expect(dict.has(step.word)).toBe(true);
      const used = tilesFor(board, step.word);
      expect(used, `board can spell ${step.word}`).not.toBeNull();
      if (step.word === 'goat') expect(used!.some((p) => board[p.c][p.r].kind !== 'normal')).toBe(true);
      // The real game marks one new tile as the gem only when the word is long enough.
      const created = refill(board, used!, make);
      if (!gemForLength(step.word.length)) for (const t of created) t.kind = 'normal';
    }
  });
});
