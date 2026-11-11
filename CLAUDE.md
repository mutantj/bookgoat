# Bookgoat: notes for Claude

Bookgoat is a Bookworm-style browser word game starring Rapunzel the goat. Vite 5 + TypeScript, no framework. The game design is in @docs/DESIGN.md; read it before changing gameplay.

- Repo: https://github.com/mutantj/bookgoat. The live site is https://mutantj.github.io/bookgoat/, deployed by `.github/workflows/pages.yml` on every push to `main` (it runs the tests, then builds).
- The developer works on a Steam Deck (Linux, bash) and tests on a phone.

## How the developer likes to work

- **Commit only when told "commit".** The developer pushes; never push. Commit straight to `main`, as the developer always has.
  - Split unrelated changes into separate commits.
  - Write the message in plain words: a short subject, then a few lines saying what changed for the player.
  - End it with the attribution lines the session gives you.
- **"Update the version number"** means bumping the patch version in `package.json` (line 3) and `package-lock.json` (lines 3 and 9), e.g. 0.0.14 → 0.0.15. It's committed separately as "Set the version to x.y.z". The version shows on the home screen.
- When a request is ambiguous in a way that changes what gets built (for example a number that could mean two things), ask a short multiple-choice question. Otherwise make a sensible call and say what you chose.
- For visual changes, take a screenshot and send it, so the developer can see the change on their phone.
- Keep the Cloudflare API token private: never ask for it in chat, never write it to a file, never commit it.

## Commands

Node 22 comes from nvm; load it first in each shell:
```
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
npx tsc --noEmit      # type check
npx vitest run        # tests (src/**/*.test.ts)
npm run build         # tsc + vite build → dist/
npm run dev           # dev server; add --host to try it on the phone
```
Run the type check, the tests and the build before saying a change is done.

## Code layout

| Path | What's there |
|---|---|
| `src/main.ts` | Classic/Blitz screen: board rendering, input (tap, drag, keyboard), overlays, game over, leaderboard UI, sounds, home screen |
| `src/engine/` | Classic/Blitz rules with no UI: `board.ts` (staggered grid, refill), `game.ts` (turns, scoring, fire, gem blasts), `rules.ts` (all numbers), `dictionary.ts`, `rng.ts` |
| `src/modes/` | `mode.ts` (the `GameMode` interface, the shared `dict`, `freshGame`), `classic.ts`, `blitz.ts` |
| `src/adventure/` | Adventure, a separate mode with its own board rules: `adventure.ts` (screen), `rules.ts` (pick-any-tile board, damage), `tuning.ts` (numbers), `enemies.ts` (stages and enemies), `tutorial.ts`, `artifacts.ts`, `save.ts`, `adventure.css` |
| `src/ui/` | `goat.ts` (Rapunzel's SVG and moods), `sound.ts` (Web Audio effects with pitch), `storage.ts` (Classic saves, scores, leaderboard queue), `leaderboard.ts` (online boards with an offline queue) |
| `src/features.ts`, `vite.config.ts` | feature flags as build-time constants |
| `server/` | the Cloudflare Worker + D1 leaderboard service; see `server/README.md` |
| `art/`, `audio/export/` | SVGs (imported with `?raw`) and the `.wav` sounds |
| `public/` | app icons (Rapunzel's face) and `manifest.webmanifest`; rebuild the icons with `node scripts/make-icons.mjs` after changing her drawing (the PNG step is in that script's comment) |

Notes:
- **Feature flags:** `__FEATURE_ADVENTURE__` is set from `VITE_FEATURE_ADVENTURE` (`off`, `false`, `0` or `no` turn it off; the default is on). `main.ts` loads Adventure with a dynamic `import()` only when the flag is on, so a build without it contains none of its code or CSS. Keep it that way: no static imports of `src/adventure/` from shared code.
- **Live site settings** are GitHub repository variables: `VITE_LEADERBOARD_URL` and `VITE_FEATURE_ADVENTURE`.
- **Board size:** `fitBoard` in `main.ts` sizes Classic tiles (`--s`) from a stable `100svh` probe, so mobile browser bars don't make the board jump. Adventure sizes its own `--s` in CSS.

## Code style

- Match the surrounding code: single quotes, long lines (about 140 characters), two-space indent, short plain-English comments that explain why.
- **Don't run Prettier.** The repo isn't formatted with it, and it rewrites quotes and line breaks.
- Player-facing text is plain and friendly, and Rapunzel talks in the first person.
- Put new tunable numbers in the area's numbers file (`rules.ts`, `tuning.ts`, `BLITZ`, `enemies.ts`), not inline.
- Add or update tests for rule changes (`engine.test.ts`, `adventure/*.test.ts`).

## Checking changes in a real browser

Headless Chrome through the DevTools protocol works well for screenshots and for scripted play:
- Build first, then serve `dist/` with `npx vite preview --port 4187 --host 127.0.0.1`.
- Start Chrome with `flatpak run com.google.Chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<a scratch folder>`.
- Drive it with a small Node script that opens a tab via `http://127.0.0.1:9333/json/new`, then uses `Runtime.evaluate`, `Input.dispatchMouseEvent`, `Emulation.setDeviceMetricsOverride` (a phone is about 390×844) and `Page.captureScreenshot`. Node 22 runs `.ts` scripts directly, but not from inside `node_modules`.
- Useful shortcuts:
  - Seed state through `localStorage` keys (`bookgoat.classic.save.v1`, `bookgoat.adventure.run.v1`, `bookgoat.adventure.artifacts.v1`).
  - Type letters in Adventure by sending `keydown` events to `window`.
  - The home screen waits up to 4 seconds for the greeting before opening a mode.
- **Start the server and Chrome as background tasks, and stop them by task ID.** Don't use `pkill -f "<pattern>"`: the pattern matches the shell running pkill, which kills it (exit 144), and any later commands never run. That once left preview servers running for days. Afterwards, check nothing is left: `ps -eo pid,args | grep "[v]ite preview"`.
- For the leaderboard, run the service locally from `server/` (`npm run db:local` once, then `npm run dev` on port 8787) and build the game with `VITE_LEADERBOARD_URL=http://127.0.0.1:8787`.
