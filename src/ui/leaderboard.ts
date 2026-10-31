// Online leaderboards (server/ is the service). Scores that can't be sent, because the device is
// offline or the service is down, wait in a queue on the device and are sent later.
import type { ModeId } from '../modes/mode';
import { loadCutoff, loadPending, saveCutoff, savePending, type PendingScore } from './storage';

const BASE: string = (import.meta.env.VITE_LEADERBOARD_URL ?? '').replace(/\/$/, '');
const TOP = 10;
const MAX_PENDING = 10;

/** False when the build has no leaderboard address; the game then sticks to local scores. */
export const leaderboardEnabled = !!BASE;

export interface OnlineScore {
  initials: string;
  score: number;
  level: number;
  bestWord: string;
}

type SendResult = { status: 'posted'; rank: number; top: OnlineScore[] } | { status: 'rejected'; error: string } | { status: 'later' };

async function send(p: PendingScore): Promise<SendResult> {
  try {
    const res = await fetch(`${BASE}/boards/${p.board}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initials: p.initials, score: p.score, level: p.level, bestWord: p.bestWord, version: p.version }),
      signal: AbortSignal.timeout(6000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      remember(p.board, body.top);
      return { status: 'posted', rank: body.rank, top: body.top };
    }
    // Too many posts or a server fault: try again later. Anything else won't ever be accepted.
    if (res.status === 429 || res.status >= 500) return { status: 'later' };
    return { status: 'rejected', error: body.error ?? 'rejected' };
  } catch {
    return { status: 'later' }; // offline or timed out
  }
}

function remember(board: ModeId, top: OnlineScore[]) {
  saveCutoff(board, { count: top.length, lowest: top.at(-1)?.score ?? 0 });
}

/** The board's top 10, or null if it can't be reached. */
export async function fetchTop(board: ModeId): Promise<OnlineScore[] | null> {
  if (!leaderboardEnabled) return null;
  try {
    const res = await fetch(`${BASE}/boards/${board}/top`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const { top } = (await res.json()) as { top: OnlineScore[] };
    remember(board, top);
    return top;
  } catch {
    return null;
  }
}

/** Would this score make the top 10? Uses the live board if it can be reached, otherwise the last one seen. */
export async function qualifies(board: ModeId, score: number): Promise<boolean> {
  if (!leaderboardEnabled || score <= 0) return false;
  const top = await fetchTop(board);
  if (top) return top.length < TOP || score > top[TOP - 1].score;
  const seen = loadCutoff(board);
  return !seen || seen.count < TOP || score > seen.lowest;
}

/** Post a score now, or keep it to post later if that isn't possible. */
export async function postScore(p: PendingScore): Promise<Exclude<SendResult, { status: 'later' }> | { status: 'queued' }> {
  const res = await send(p);
  if (res.status === 'later') {
    savePending([...loadPending(), p].slice(-MAX_PENDING));
    return { status: 'queued' };
  }
  void flushPending();
  return res;
}

export const pendingCount = (board?: ModeId) => loadPending().filter((p) => !board || p.board === board).length;

let flushing: Promise<void> | null = null;
/** Send waiting scores one at a time, stopping at the first one that still can't get through. */
export function flushPending(): Promise<void> {
  if (!leaderboardEnabled) return Promise.resolve();
  flushing ??= (async () => {
    let queue = loadPending();
    while (queue.length) {
      const sent = queue[0];
      if ((await send(sent)).status === 'later') break;
      // Re-read: a score may have been queued meanwhile.
      queue = loadPending().filter((q) => q.playedAt !== sent.playedAt || q.board !== sent.board);
      savePending(queue);
    }
  })().finally(() => (flushing = null));
  return flushing;
}
