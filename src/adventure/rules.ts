// Adventure's own board rules, kept apart from the screen so they can be tested. Unlike Classic, a word
// can use any tiles on the board in any order; the tiles you pick leave the board, and after an attack
// the columns fall and new tiles drop in on top.
import type { Pos, Tile } from '../engine/board';
import type { Enemy } from './enemies';
import { TUNING, lengthMultiplier } from './tuning';

export const SIZE = 4;

export type Board = Tile[][]; // board[c][r], r = 0 is the top row

const isGem = (t: Tile): t is Tile & { kind: keyof typeof TUNING.gemMultiplier } => t.kind in TUNING.gemMultiplier;

/** A new board, from `rows` (top row first) if given. */
export function makeBoard(make: (board: Board) => Tile, rows?: string[]): Board {
  const board: Board = [];
  for (let c = 0; c < SIZE; c++) {
    board.push([]);
    for (let r = 0; r < SIZE; r++) {
      const t = make(board);
      if (rows) t.letter = rows[r][c] === 'Q' ? 'Qu' : rows[r][c];
      board[c].push(t);
    }
  }
  return board;
}

/** Remove the used tiles; each column falls and new tiles fill it from the top. Returns the new tiles. */
export function refill(board: Board, used: Pos[], make: (board: Board) => Tile): Tile[] {
  const created: Tile[] = [];
  for (let c = 0; c < board.length; c++) {
    const gone = new Set(used.filter((p) => p.c === c).map((p) => p.r));
    if (!gone.size) continue;
    const added = [...gone].map(() => make(board));
    created.push(...added);
    board[c] = [...added, ...board[c].filter((_, r) => !gone.has(r))];
  }
  return created;
}

/** Tiles that spell `word`, not counting `taken` ones, preferring gems. Null if the board can't spell it. */
export function tilesFor(board: Board, word: string, taken: Pos[] = []): Pos[] | null {
  const free: Pos[] = [];
  for (let c = 0; c < board.length; c++)
    for (let r = 0; r < board[c].length; r++) if (!board[c][r].rubble && !taken.some((p) => p.c === c && p.r === r)) free.push({ c, r });
  free.sort((a, b) => Number(isGem(board[b.c][b.r])) - Number(isGem(board[a.c][a.r])));
  const out: Pos[] = [];
  let rest = word;
  while (rest) {
    const i = free.findIndex((p) => rest.startsWith(board[p.c][p.r].letter.toLowerCase()));
    if (i < 0) return null;
    rest = rest.slice(board[free[i].c][free[i].r].letter.length);
    out.push(free.splice(i, 1)[0]);
  }
  return out;
}

/** An enemy smashes a tile (a gem loses its gem) into rubble, unless `max` tiles are rubble already. Returns where. */
export function smashTile(board: Board, max: number, pick: (spots: Pos[]) => Pos): Pos | null {
  const spots: Pos[] = [];
  for (let c = 0; c < board.length; c++) for (let r = 0; r < board[c].length; r++) if (!board[c][r].rubble) spots.push({ c, r });
  if (!spots.length || board.length * board[0].length - spots.length >= max) return null;
  const p = pick(spots);
  const t = board[p.c][p.r];
  t.rubble = true;
  t.kind = 'normal';
  return p;
}

/**
 * Which new tile becomes the gem a long word leaves: the tutorial's scripted one (marked `fresh`) if there is one,
 * otherwise a random one whose letter the enemy hasn't hexed or frozen. Null if every new tile is marked.
 */
export function gemTile(created: Tile[], marked: (t: Tile) => boolean, pick: (tiles: Tile[]) => Tile): Tile | null {
  const scripted = created.find((t) => t.fresh);
  if (scripted) return scripted;
  const free = created.filter((t) => !marked(t));
  return free.length ? pick(free) : null;
}

/**
 * The damage a word does, and the working, e.g. "4 × 1.25 × 1.25 gem". `boost` is an artifact's multiplier, if one is
 * in use. `turn` is Rapunzel's word number this battle (1 for the first), for powers that change from turn to turn.
 */
export function damageFor(tiles: Tile[], enemy: Enemy, boost?: { multiplier: number; name: string }, turn = 1): { total: number; math: string } {
  const word = tiles.map((t) => t.letter.toLowerCase()).join('');
  const letters = tiles.reduce((sum, t) => sum + (TUNING.letterDamage[t.letter] ?? 1), 0);
  const length = lengthMultiplier(word.length);
  const gem = tiles.reduce((m, t) => m * (isGem(t) ? TUNING.gemMultiplier[t.kind] : 1), 1);
  const raw = letters * length * gem * (boost?.multiplier ?? 1);
  const gems = tiles.filter(isGem).length;
  // Apply each power in turn, noting which ones changed the damage, for the working.
  const changedBy: string[] = [];
  const afterPowers = enemy.powers.reduce((d, p) => {
    const next = p.damage?.(d, { word, length: word.length, gems, turn }) ?? d;
    if (next !== d) changedBy.push(p.name);
    return next;
  }, raw);
  const parts = [`${num(letters)} × ${num(length)}`];
  if (gem !== 1) parts.push(`× ${num(gem)} gem`);
  if (boost) parts.push(`× ${num(boost.multiplier)} ${boost.name}`);
  if (changedBy.length) parts.push(`then ${changedBy.join(', ')}`);
  return { total: Math.max(TUNING.minDamage, Math.round(afterPowers)), math: parts.join(' ') };
}

/** 6.25 → "6.25", 1.5 → "1.5", 2 → "2". */
export const num = (n: number) => String(Math.round(n * 100) / 100);
