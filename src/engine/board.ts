import { RULES, type TileKind } from './rules';
import type { Rng } from './rng';

export interface Tile {
  id: number;
  letter: string; // 'A'..'Z' or 'Qu'
  kind: TileKind;
  /** Burning tiles don't burn on the turn they appear. */
  fresh?: boolean;
}

export interface Pos {
  c: number;
  r: number;
}

/** board[c][r]; r = 0 is the top row. Odd columns sit half a tile lower. */
export type Board = Tile[][];

export const samePos = (a: Pos, b: Pos) => a.c === b.c && a.r === b.r;

/** Hex-style neighbours on a staggered grid (odd columns shifted down). */
export function neighbors(p: Pos, cols: number = RULES.cols, rows: number = RULES.rows): Pos[] {
  const out: Pos[] = [
    { c: p.c, r: p.r - 1 },
    { c: p.c, r: p.r + 1 },
  ];
  const sideRows = p.c % 2 === 0 ? [p.r - 1, p.r] : [p.r, p.r + 1];
  for (const dc of [-1, 1]) for (const r of sideRows) out.push({ c: p.c + dc, r });
  return out.filter((q) => q.c >= 0 && q.c < cols && q.r >= 0 && q.r < rows);
}

export function isAdjacent(a: Pos, b: Pos): boolean {
  return neighbors(a).some((n) => samePos(n, b));
}

/** A path is valid if it has no repeats and each step touches the previous tile. */
export function isValidPath(path: Pos[]): boolean {
  for (let i = 0; i < path.length; i++) {
    for (let j = 0; j < i; j++) if (samePos(path[i], path[j])) return false;
    if (i > 0 && !isAdjacent(path[i - 1], path[i])) return false;
  }
  return true;
}

export const tileText = (t: Tile) => t.letter.toLowerCase();
export const tileLength = (t: Tile) => t.letter.length; // 'Qu' counts as 2

export function wordFromPath(board: Board, path: Pos[]): string {
  return path.map((p) => tileText(board[p.c][p.r])).join('');
}

export class TileFactory {
  constructor(private rng: Rng, public nextId = 1) {}

  /** Pick a letter, steering away from vowel droughts and rare-letter pileups. */
  letter(board: Board | null): string {
    const counts: Record<string, number> = {};
    let vowels = 0;
    let total = 0;
    if (board) {
      for (const col of board)
        for (const t of col) {
          if (!t) continue;
          counts[t.letter] = (counts[t.letter] ?? 0) + 1;
          total++;
          if ((RULES.vowels as readonly string[]).includes(t.letter)) vowels++;
        }
    }
    const weights: Record<string, number> = { ...RULES.letterWeights };
    if (total > 0 && vowels / total < RULES.minVowelShare) for (const v of RULES.vowels) weights[v] *= 3;
    for (const r of RULES.rareLetters) if ((counts[r] ?? 0) >= RULES.maxRareCopies) weights[r] = 0;
    return this.rng.weighted(weights);
  }

  make(board: Board | null, kind: TileKind = 'normal'): Tile {
    return { id: this.nextId++, letter: this.letter(board), kind };
  }
}

export function newBoard(factory: TileFactory): Board {
  const board: Board = [];
  for (let c = 0; c < RULES.cols; c++) {
    board.push([]);
    for (let r = 0; r < RULES.rows; r++) board[c].push(factory.make(board));
  }
  return board;
}

/**
 * Remove tiles at the given positions, let columns fall, and fill from the top.
 * Returns the new tiles (in board order) so callers can upgrade one to a gem/burning tile.
 */
export function removeAndRefill(board: Board, remove: Pos[], factory: TileFactory): Tile[] {
  const created: Tile[] = [];
  for (let c = 0; c < board.length; c++) {
    const gone = new Set(remove.filter((p) => p.c === c).map((p) => p.r));
    if (gone.size === 0) continue;
    const kept = board[c].filter((_, r) => !gone.has(r));
    const fresh: Tile[] = [];
    for (let i = 0; i < gone.size; i++) fresh.push(factory.make(board));
    created.push(...fresh);
    board[c] = [...fresh, ...kept];
  }
  return created;
}

export function findTile(board: Board, id: number): Pos | null {
  for (let c = 0; c < board.length; c++)
    for (let r = 0; r < board[c].length; r++) if (board[c][r].id === id) return { c, r };
  return null;
}
