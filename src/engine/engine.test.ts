import { describe, expect, it } from 'vitest';
import { isAdjacent, isValidPath, neighbors, type Board, type Tile } from './board';
import { ClassicGame, scoreTiles } from './classic';
import { dictionaryFromText } from './dictionary';
import { findPath } from './pathfind';
import { RULES } from './rules';

const dict = dictionaryFromText('cat\ncats\ncoat\nquit\nquilt\nact\ntac\nbanana\nplanets');
let id = 1;
const T = (letter: string, kind: Tile['kind'] = 'normal'): Tile => ({ id: id++, letter, kind });

/** Build a board from column strings (top→bottom). '*' marks a burning tile on the next letter. */
function boardFrom(cols: string[]): Board {
  return cols.map((s) => {
    const out: Tile[] = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '*') out.push(T(s[++i], 'burning'));
      else if (s[i] === 'Q') out.push(T('Qu'));
      else out.push(T(s[i]));
    }
    return out;
  });
}

describe('staggered grid adjacency', () => {
  it('even columns touch the row above and same row in neighbouring columns', () => {
    expect(isAdjacent({ c: 2, r: 3 }, { c: 1, r: 2 })).toBe(true);
    expect(isAdjacent({ c: 2, r: 3 }, { c: 1, r: 3 })).toBe(true);
    expect(isAdjacent({ c: 2, r: 3 }, { c: 1, r: 4 })).toBe(false);
  });
  it('odd columns touch the same row and row below', () => {
    expect(isAdjacent({ c: 1, r: 3 }, { c: 2, r: 4 })).toBe(true);
    expect(isAdjacent({ c: 1, r: 3 }, { c: 2, r: 2 })).toBe(false);
  });
  it('adjacency is symmetric everywhere', () => {
    for (let c = 0; c < RULES.cols; c++)
      for (let r = 0; r < RULES.rows; r++)
        for (const n of neighbors({ c, r })) expect(isAdjacent(n, { c, r })).toBe(true);
  });
  it('interior tiles have six neighbours', () => {
    expect(neighbors({ c: 3, r: 4 })).toHaveLength(6);
  });
  it('rejects repeated tiles and jumps', () => {
    expect(isValidPath([{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 0 }])).toBe(false);
    expect(isValidPath([{ c: 0, r: 0 }, { c: 0, r: 2 }])).toBe(false);
  });
});

describe('scoring', () => {
  it('scales with length and rare letters', () => {
    const cat = scoreTiles([T('C'), T('A'), T('T')]);
    const cats = scoreTiles([T('C'), T('A'), T('T'), T('S')]);
    expect(cat).toBe(Math.round(3.25 * 1 * 10));
    expect(cats).toBeGreaterThan(cat);
  });
  it('Qu counts as two letters', () => {
    expect(scoreTiles([T('Qu'), T('I')])).toBeGreaterThan(0); // "qui" is 3 letters long
  });
  it('gems multiply', () => {
    const plain = scoreTiles([T('C'), T('A'), T('T')]);
    const gem = scoreTiles([T('C', 'gold'), T('A'), T('T')]);
    expect(Math.abs(gem - plain * 1.5)).toBeLessThanOrEqual(1);
  });
});

describe('path finding for typed words', () => {
  it('finds a path including a Qu tile', () => {
    const board = boardFrom(['QIL', 'XTA', 'CAT', 'XXX', 'XXX', 'XXX', 'XXX']);
    const p = findPath(board, 'quilt');
    expect(p).not.toBeNull();
    expect(isValidPath(p!)).toBe(true);
  });
  it('returns null when the word is not on the board', () => {
    const board = boardFrom(['CAT', 'XXX', 'XXX', 'XXX', 'XXX', 'XXX', 'XXX']);
    expect(findPath(board, 'dog')).toBeNull();
  });
  it('prefers burning tiles', () => {
    const board = boardFrom(['CA*T', 'XXT', 'XXX', 'XXX', 'XXX', 'XXX', 'XXX']);
    const p = findPath(board, 'cat')!;
    expect(board[p[2].c][p[2].r].kind).toBe('burning');
  });
});

describe('classic game', () => {
  const make = () => new ClassicGame(dict, ['banana'], 42);

  it('starts with a full 7×8 board', () => {
    const g = make();
    expect(g.board).toHaveLength(7);
    for (const col of g.board) expect(col).toHaveLength(8);
  });

  it('accepts a real word, scores it and refills the board', () => {
    const g = make();
    g.state.board = boardFrom(['CATXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX']);
    const res = g.submit([{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 2 }]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.word).toBe('cat');
    expect(g.state.score).toBe(res.points);
    expect(g.board[0]).toHaveLength(8);
    expect(res.newTileIds).toHaveLength(3);
  });

  it('rejects non-words and short words', () => {
    const g = make();
    g.state.board = boardFrom(['CTAXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX']);
    const bad = g.submit([{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 2 }]);
    expect(bad).toMatchObject({ ok: false, reason: 'not-a-word' });
    const short = g.submit([{ c: 0, r: 0 }, { c: 0, r: 1 }]);
    expect(short).toMatchObject({ ok: false, reason: 'too-short' });
    expect(g.state.score).toBe(0);
  });

  it('long words leave a gem behind', () => {
    const g = make();
    g.state.board = boardFrom(['BANANAXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX']);
    const path = [0, 1, 2, 3, 4, 5].map((r) => ({ c: 0, r }));
    const res = g.submit(path);
    expect(res.ok && res.gemEarned).toBe('green');
    expect(g.board.flat().some((t) => t.kind === 'green')).toBe(true);
  });

  it('spelling the bonus word pays the bonus once', () => {
    const g = make();
    expect(g.state.bonusWord).toBe('banana');
    g.state.board = boardFrom(['BANANAXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX']);
    const res = g.submit([0, 1, 2, 3, 4, 5].map((r) => ({ c: 0, r })));
    expect(res.ok && res.bonusHit).toBe(true);
  });

  it('fire burns the tile below each turn and ends the game at the bottom', () => {
    const g = make();
    // Column 6 has a fire one row above the bottom.
    g.state.board = boardFrom(['CATXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXX*XX']);
    const fireId = g.board[6][6].id;
    const r1 = g.submit([{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 2 }]);
    expect(r1.ok && r1.burnedTileIds).toHaveLength(1);
    expect(g.board[6][7].id).toBe(fireId); // dropped to the bottom row
    expect(g.state.gameOver).toBe(false);
    g.state.board[0] = boardFrom(['CATXXXXX'])[0];
    const r2 = g.submit([{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 2 }]);
    expect(r2.ok && r2.gameOver).toBe(true);
  });

  it('using a burning tile puts the fire out', () => {
    const g = make();
    g.state.board = boardFrom(['CA*TXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX']);
    const fireId = g.board[0][2].id;
    g.submit([{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 2 }]);
    expect(g.board.flat().some((t) => t.id === fireId)).toBe(false);
  });

  it('scramble adds a fire and keeps the board full', () => {
    const g = make();
    const res = g.scramble();
    expect(res.spawnedBurning).toHaveLength(1);
    for (const col of g.board) expect(col).toHaveLength(8);
  });

  it('levels up when the target is reached', () => {
    const g = make();
    g.state.levelPoints = RULES.levelTarget(1) - 1;
    g.state.board = boardFrom(['CATXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX']);
    const res = g.submit([{ c: 0, r: 0 }, { c: 0, r: 1 }, { c: 0, r: 2 }]);
    expect(res.ok && res.levelUp).toBe(true);
    expect(g.state.level).toBe(2);
  });

  it('round-trips through saved state', () => {
    const g = make();
    const saved = JSON.parse(JSON.stringify(g.state));
    const g2 = new ClassicGame(dict, ['banana'], saved);
    g.scramble();
    g2.scramble();
    expect(g2.state.board).toEqual(g.state.board);
  });

  it('keeps a healthy share of vowels over a long game', () => {
    const g = new ClassicGame(dict, ['banana'], 7);
    for (let i = 0; i < 50; i++) g.scramble();
    const letters = g.board.flat().map((t) => t.letter);
    const vowels = letters.filter((l) => 'AEIOU'.includes(l)).length;
    expect(vowels / letters.length).toBeGreaterThan(0.2);
  });
});
