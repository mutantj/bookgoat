// Bookgoat's online leaderboards: no accounts, just initials and a score per board.
//   GET  /boards/:board/top     → the top 10, highest first
//   POST /boards/:board/scores  → { initials, score, level, bestWord, version } → { rank, top }

interface Env {
  DB: D1Database;
  POST_LIMIT: RateLimit;
}

/** Highest believable score on each board. Anything above is rejected. */
const BOARDS: Record<string, { maxScore: number }> = {
  classic: { maxScore: 1_000_000 },
  blitz: { maxScore: 100_000 },
};
const TOP = 10;

const BLOCKED = new Set(
  'ASS CUM COK DIK DIC FAG FCK FUC FUK FUQ JIZ KKK NIG NGR PUS SEX TIT TWT WTF XXX'.split(' '),
);

const ALLOWED_ORIGINS = [/^https:\/\/mutantj\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });

async function top(env: Env, board: string) {
  const { results } = await env.DB.prepare(
    'SELECT initials, score, level, best_word AS bestWord, created_at AS date FROM scores WHERE board = ? ORDER BY score DESC, id ASC LIMIT ?',
  )
    .bind(board, TOP)
    .all();
  return results;
}

/** Checks a posted score, returning the cleaned entry or the reason it was refused. */
function validate(board: string, body: any): { entry?: { initials: string; score: number; level: number; bestWord: string; version: string }; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'bad-body' };
  const initials = typeof body.initials === 'string' ? body.initials.toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(initials)) return { error: 'bad-initials' };
  if (BLOCKED.has(initials)) return { error: 'blocked-initials' };
  const { score, level } = body;
  if (!Number.isInteger(score) || score < 0 || score > BOARDS[board].maxScore) return { error: 'bad-score' };
  if (!Number.isInteger(level) || level < 1 || level > 999) return { error: 'bad-level' };
  const bestWord = typeof body.bestWord === 'string' && /^[a-z]{0,30}$/i.test(body.bestWord) ? body.bestWord.toLowerCase() : '';
  const version = typeof body.version === 'string' && /^[\w.-]{1,20}$/.test(body.version) ? body.version : '';
  return { entry: { initials, score, level, bestWord, version } };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

    const m = new URL(req.url).pathname.match(/^\/boards\/([a-z0-9-]+)\/(top|scores)$/);
    if (!m) return json(req, { error: 'not-found' }, 404);
    const [, board, action] = m;
    if (!BOARDS[board]) return json(req, { error: 'unknown-board' }, 404);

    if (action === 'top' && req.method === 'GET') return json(req, { board, top: await top(env, board) });

    if (action === 'scores' && req.method === 'POST') {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
      if (!(await env.POST_LIMIT.limit({ key: ip })).success) return json(req, { error: 'too-many' }, 429);

      const { entry, error } = validate(board, await req.json().catch(() => null));
      if (!entry) return json(req, { error }, 400);
      await env.DB.prepare('INSERT INTO scores (board, initials, score, level, best_word, version) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(board, entry.initials, entry.score, entry.level, entry.bestWord, entry.version)
        .run();
      const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE board = ? AND score > ?').bind(board, entry.score).first<{ n: number }>();
      const rank = (above?.n ?? 0) + 1;
      return json(req, { board, rank, madeTop: rank <= TOP, top: await top(env, board) });
    }

    return json(req, { error: 'method-not-allowed' }, 405);
  },
} satisfies ExportedHandler<Env>;
