import type { ClassicState } from '../engine/classic';

export type Mode = 'classic' | 'blitz';

// Only Classic games are saved mid-game; a Blitz round is over in a minute.
const SAVE_KEY = 'bookgoat.classic.save.v1';
const SCORES_KEY: Record<Mode, string> = { classic: 'bookgoat.classic.scores.v1', blitz: 'bookgoat.blitz.scores.v1' };

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

export const loadGame = () => read<ClassicState>(SAVE_KEY);
export const saveGame = (s: ClassicState | null) => write(SAVE_KEY, s);
export const loadScores = (mode: Mode) => read<HighScore[]>(SCORES_KEY[mode]) ?? [];

/** Adds a score and returns its rank (0-based) in the top five, or -1. */
export function addScore(mode: Mode, entry: HighScore): number {
  const scores = loadScores(mode);
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, 5);
  write(SCORES_KEY[mode], top);
  return top.indexOf(entry);
}
