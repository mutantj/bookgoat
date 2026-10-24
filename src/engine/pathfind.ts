import { neighbors, type Board, type Pos } from './board';
import { RULES } from './rules';

/** How much we'd like a path to use each tile: gems first, then burning tiles. */
function tilePreference(board: Board, p: Pos): number {
  const k = board[p.c][p.r].kind;
  if (k === 'burning') return 3 + p.r * 0.1; // lower burning tiles are more urgent
  if (k === 'normal') return 0;
  return 2 + RULES.gemMultiplier[k];
}

/**
 * Find a path on the board that spells `word` (lowercase; "qu" may use a Qu tile).
 * When several paths exist, return the one that uses the most valuable tiles.
 */
export function findPath(board: Board, word: string): Pos[] | null {
  word = word.toLowerCase();
  let best: Pos[] | null = null;
  let bestScore = -1;
  let explored = 0;

  const visit = (p: Pos, i: number, path: Pos[], used: Set<string>, score: number) => {
    if (explored++ > 50000) return;
    const text = board[p.c][p.r].letter.toLowerCase();
    if (!word.startsWith(text, i)) return;
    const key = `${p.c},${p.r}`;
    used.add(key);
    path.push(p);
    const s = score + tilePreference(board, p);
    const j = i + text.length;
    if (j === word.length) {
      if (s > bestScore) {
        bestScore = s;
        best = [...path];
      }
    } else {
      for (const n of neighbors(p, board.length, board[0].length)) if (!used.has(`${n.c},${n.r}`)) visit(n, j, path, used, s);
    }
    path.pop();
    used.delete(key);
  };

  for (let c = 0; c < board.length; c++)
    for (let r = 0; r < board[c].length; r++) visit({ c, r }, 0, [], new Set(), 0);
  return best as Pos[] | null;
}
