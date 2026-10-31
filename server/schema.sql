-- One row per posted score. Nothing about the player is kept except the initials they typed.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL,
  initials TEXT NOT NULL,
  score INTEGER NOT NULL,
  level INTEGER NOT NULL,
  best_word TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS scores_by_board ON scores (board, score DESC);
