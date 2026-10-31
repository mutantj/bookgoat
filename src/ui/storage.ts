import type { GameState } from '../engine/game';
import type { ModeId } from '../modes/mode';

// Only Classic games are saved mid-game; a Blitz round is over in a minute.
const SAVE_KEY = 'bookgoat.classic.save.v1';
const SCORES_KEY: Record<ModeId, string> = { classic: 'bookgoat.classic.scores.v1', blitz: 'bookgoat.blitz.scores.v1' };

export interface HighScore {
  score: number;
  level: number;
  best: string;
  date: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the game still plays, it just won't resume */
  }
}

export const loadGame = () => read<GameState>(SAVE_KEY);
export const saveGame = (s: GameState | null) => write(SAVE_KEY, s);
export const loadScores = (mode: ModeId) => read<HighScore[]>(SCORES_KEY[mode]) ?? [];

/** Adds a score and returns its rank (0-based) in the top five, or -1. */
export function addScore(mode: ModeId, entry: HighScore): number {
  const scores = loadScores(mode);
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, 5);
  write(SCORES_KEY[mode], top);
  return top.indexOf(entry);
}

/* ---------------- Online leaderboard (see leaderboard.ts) ---------------- */

/** A score waiting to be posted, kept on the device while offline. */
export interface PendingScore {
  board: ModeId;
  initials: string;
  score: number;
  level: number;
  bestWord: string;
  version: string;
  playedAt: string;
}
/** What the device last saw of a board: how many entries, and the lowest score in the top 10. */
export interface BoardCutoff {
  count: number;
  lowest: number;
}

const PENDING_KEY = 'bookgoat.pending.v1';
const CUTOFFS_KEY = 'bookgoat.cutoffs.v1';
const INITIALS_KEY = 'bookgoat.initials.v1';

export const loadPending = () => read<PendingScore[]>(PENDING_KEY) ?? [];
export const savePending = (q: PendingScore[]) => write(PENDING_KEY, q.length ? q : null);
export const loadCutoff = (board: ModeId) => read<Partial<Record<ModeId, BoardCutoff>>>(CUTOFFS_KEY)?.[board] ?? null;
export function saveCutoff(board: ModeId, cutoff: BoardCutoff) {
  write(CUTOFFS_KEY, { ...read<Partial<Record<ModeId, BoardCutoff>>>(CUTOFFS_KEY), [board]: cutoff });
}
export const loadInitials = () => read<string>(INITIALS_KEY) ?? '';
export const saveInitials = (initials: string) => write(INITIALS_KEY, initials);
