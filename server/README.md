# Bookgoat leaderboard service

A Cloudflare Worker with a D1 database that keeps the online Classic and Blitz leaderboards. It's free at Bookgoat's size. No accounts: a score is just initials, score, level and best word.

- `GET /boards/classic/top` (or `blitz`): the top 10
- `POST /boards/classic/scores`: `{ "initials": "ABC", "score": 1200, "level": 3, "bestWord": "goats", "version": "0.0.6" }`

It refuses initials that aren't 3 letters A–Z or are on the blocklist, scores above each board's cap (`BOARDS` in `src/index.ts`), and more than 10 posts a minute from one connection.

## First-time setup

Run these from this `server/` folder.

1. Make a free account at https://dash.cloudflare.com/sign-up.
2. Install and log in (opens a browser):
   ```
   npm install
   npx wrangler login
   ```
3. Create the database, then copy the `database_id` it prints into `wrangler.toml`:
   ```
   npx wrangler d1 create bookgoat-scores
   ```
4. Create the table, then deploy:
   ```
   npm run db:remote
   npm run deploy
   ```
   The deploy prints the service's address, e.g. `https://bookgoat-scores.<your-name>.workers.dev`.
5. Point the game at it: on GitHub, open the repository's **Settings → Secrets and variables → Actions → Variables** and add `VITE_LEADERBOARD_URL` with that address. The next push builds the game with the leaderboard turned on.

After changing `src/index.ts`, run `npm run deploy` again.

## Running it locally

```
npm run db:local   # once, creates the local table
npm run dev        # serves on http://localhost:8787
```

Then in the project root, put `VITE_LEADERBOARD_URL=http://localhost:8787` in a `.env.local` file and run `npm run dev` there.

## Removing junk scores

List the latest scores on a board:
```
npx wrangler d1 execute bookgoat-scores --remote --command "SELECT id, initials, score, created_at FROM scores WHERE board = 'blitz' ORDER BY id DESC LIMIT 20"
```
Delete one by its id:
```
npx wrangler d1 execute bookgoat-scores --remote --command "DELETE FROM scores WHERE id = 123"
```
