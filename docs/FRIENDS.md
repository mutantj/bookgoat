# Friends mode: plan

A new mode where you battle a friend instead of an enemy. It plays like Adventure, but the other goat is a real person, and you take turns whenever you each open the game. This is a plan, not a finished design: the numbers and some choices are open (see the end).

## How a match plays

- **Starting:** tap **Friends → New match**. You get a 4-character code like `K7QM` and a link with the code in it. Send either to your friend.
- **Joining:** your friend taps **Friends → Join** and types the code, or opens the link. The match starts.
- **Names:** each player shows as 3 initials, the same as the leaderboard (with the same blocklist).
- **Turns:** players take turns, one word each. Your word does damage to your friend's goat, then it's their turn. The first goat to reach 0 health loses. The player who started goes first.
- **Boards:** each player has their own 4×4 board, Adventure-style: pick any tiles, used tiles leave, and the columns drop. Both boards start from the same random seed, so the start is fair.
- **Damage:** the Adventure formula: letter values × length multiplier × gems. Words of 5+ letters leave a gem, as in Adventure. There are no enemy powers and no artifacts in the first version.
- **What you see on your turn:** your friend's last word and how much damage it did, then your own board.
- **Finding your turn:** the Friends screen lists your matches, marked **Your turn**, **Waiting** or **Finished**. The home screen's Friends button shows a badge when a match is waiting on you. There are no push notifications; you can nudge a friend by sending the link again.
- **Timeouts:** a code nobody joins expires after 3 days. A match with no move for 7 days ends, and the player who didn't move loses.
- **Resigning:** you can resign from the match menu.

## The code

- 4 characters from an alphabet without look-alikes (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`: no 0/O, 1/I/L). That's about 920,000 codes, plenty because only matches that are still running hold one. A finished or expired match frees its code.
- The link is `https://mutantj.github.io/bookgoat/#join=K7QM`. Opening it goes straight to the join screen with the code filled in.
- Typed codes are case-insensitive, and a space or dash is ignored.

## No accounts: how the server knows who you are

- On first use, the device makes a random secret player token and keeps it in `localStorage`. Every request about a match sends it.
- The server stores a hash of each seat's token, so a match can only be played from the two devices in it.
- **Catch:** clearing the browser's data, or switching phones, loses your matches. That's fine for a first version; a "move to another device" code could come later.

## Server (the existing Cloudflare Worker in `server/`)

Friends goes in the same Worker and D1 database as the leaderboard: one service, one deploy, and the game already knows its address (`VITE_LEADERBOARD_URL`).

**A match is a seed plus a list of moves.** Each player's board is rebuilt from the seed by replaying that player's moves, so the server never stores boards. The same goes for the game when it resumes, and a move can be checked by replaying it.

**Tables** (added to `server/schema.sql`):
```sql
CREATE TABLE matches (
  code TEXT PRIMARY KEY,             -- K7QM, while the match is open or running
  seed INTEGER NOT NULL,
  status TEXT NOT NULL,              -- waiting | playing | finished
  turn INTEGER NOT NULL DEFAULT 0,   -- moves played so far; even = seat 1's turn
  p1_name TEXT NOT NULL, p1_token TEXT NOT NULL, p1_hp INTEGER NOT NULL,
  p2_name TEXT, p2_token TEXT, p2_hp INTEGER,
  winner INTEGER,                    -- 1 or 2 when finished
  version TEXT NOT NULL,             -- game version that made it, for rule changes
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE moves (
  code TEXT NOT NULL, turn INTEGER NOT NULL, seat INTEGER NOT NULL,
  word TEXT NOT NULL, tiles TEXT NOT NULL,   -- JSON list of board positions used
  damage INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (code, turn)
);
```
Finished matches move their code to an archive key (e.g. `K7QM-2611180915`), so the 4-character code can be used again.

**Endpoints:**
| Request | What it does |
|---|---|
| `POST /matches` `{ name, token }` | New match: picks a free code and a seed. Returns the match. |
| `POST /matches/:code/join` `{ name, token }` | Takes seat 2 and starts the match. |
| `POST /matches/:code` `{ token }` | The match and its moves, for a player in it. |
| `POST /matches/mine` `{ token }` | Your matches, with whose turn it is (for the list and the badge). |
| `POST /matches/:code/moves` `{ token, turn, word, tiles }` | Plays your word. `turn` must match the server's, so a double tap or a second device can't play twice. Returns the new state. |
| `POST /matches/:code/resign` `{ token }` | Resign. |

These are POSTs so the token stays out of URLs and logs. Rate limits work like the score posts.

**Checking moves**, in two steps:
1. **First version:** the server checks the shape: it's your turn, the word is 3–16 letters, the tile positions are on the board, and the damage is under a cap. It trusts the damage the game sends. Good enough between friends.
2. **Later:** the server replays the move. It rebuilds your board from the seed and your earlier moves, checks the tiles spell the word and that the word is in the dictionary, and works out the damage itself. This needs the board, random and damage code shared with the Worker (it can import from `src/`). It also needs the word list in the Worker: about 1.7 MB, roughly 0.5 MB compressed, under the free plan's 3 MB limit.

The client should still compute damage the same way, so the first version and the later one agree.

## Client

- **Folder:** `src/friends/`, loaded like Adventure: behind a feature flag (`__FEATURE_FRIENDS__` from `VITE_FEATURE_FRIENDS`, off by default until it's ready) and with a dynamic `import()`, so a build without it carries none of its code.
  - `friends.ts`: the screens.
  - `rules.ts`: rebuild a board from a seed and moves.
  - `tuning.ts`: health and damage numbers.
  - `api.ts`: talks to the Worker.
- **Shared pieces:** the board rules (`src/adventure/rules.ts`: `makeBoard`, `refill`, `tilesFor`, `damageFor`) and letter values carry straight over. The battle screen itself is all in `adventure.ts`. The plan is to pull the board, word bar and health bars into a shared piece both modes use, instead of copying them.
- **The rival goat:** a second Rapunzel, facing left and tinted a different colour, with the friend's initials over the health bar.
- **Seeded boards:** the boards must come only from the seed and the moves, never `Math.random()`. Adventure's `TileFactory` already takes an `Rng`, so this is mostly a matter of not mixing in other randomness (the gem placement uses the same `rng`).
- **Offline:** a turn needs the network. If posting fails, the word stays in the word bar with a "Couldn't send, try again" message. The match list shows what it last knew.

## Steps

1. **Hot-seat prototype, no server.** Two players on one phone, passing it back and forth, to tune health and damage and to build the shared battle screen. It's cheap, playable on day one, and everything after it reuses it.
2. **Server:** the tables, codes, tokens and endpoints, with tests. Run it locally with `npm run dev` in `server/`.
3. **Online client:** the Friends screen (match list, New match, Join, the `#join=` link), playing a turn, refreshing when the screen opens, and the home badge.
4. **Move checking on the server** (step 2 of "Checking moves").
5. **Later:** rematch with one tap, artifacts or arena powers, push notifications, a permanent per-player code with a friends list, and moving matches to a new device.

## Open questions

- **Health and damage:** Adventure words do about 4–20 damage. With 60–80 health each, a match is about 6–10 words each. Is that the right length?
- **Can you see your friend's board?** Hiding it keeps each turn quick; showing it (read-only) adds strategy.
- **One word per turn,** or let a turn hold 2–3 words so matches finish sooner?
- **Should gems carry anything extra,** or should a first-player advantage be offset, for example by the second player starting with a gem?
- **What happens when both boards hit a dead end?** Adventure leans new tiles toward vowels, so it's rare, but a "swap 3 tiles, skip your attack" move would cover it.
