# Bookgoat design

A browser word game in the spirit of Bookworm, starring Rapunzel, an original goat with a long golden braid. It plays in portrait on a phone first, and works on desktop too. The live site is https://mutantj.github.io/bookgoat/.

There are three modes: **Classic**, **Blitz** and **Adventure**. Adventure is behind a feature flag. Every number worth tuning lives in one file per area: `src/engine/rules.ts` for Classic and Blitz, `src/adventure/tuning.ts` and `src/adventure/enemies.ts` for Adventure.

## Classic

- The board has 7 columns and 8 rows. Odd columns sit half a tile lower, so each tile touches up to six others.
- Drag across touching letters, or tap them one by one, to spell a word of 3+ letters. Tap the last letter again, or press **Feed**, to feed it to Rapunzel. The tiles fly into her mouth, and new tiles fall in from the top.
- **Scoring:** letter values × a length multiplier × gem multipliers, × 10. Rare letters are worth more. **Qu** is one tile that counts as two letters.
- **Gems:** long words leave a gem tile in the refill: green at 6 letters, gold at 7, sapphire at 8, diamond at 9, crystal at 10+. Using a gem multiplies that word's score.
- **Fire:** short words (3 to 5 letters) can start a burning tile, and so does **Scramble**. Each turn, every fire burns the tile beneath it and drops a row. This starts on the very next turn after the fire appears.
  - Using a burning tile in a word puts it out.
  - If a fire is on the bottom row with nothing left to burn, the game ends.
  - Fires get more likely as the level goes up, and the board can hold 1 fire plus 1 more every 3 levels.
- **Levels:** fill the hay bar to reach the next level; the target grows each level. Each level has a **bonus word** worth extra points.
- The game is saved after every word, so Classic can be continued later. High scores are kept on the device.

## Blitz

The same board and rules against a one-minute clock, after a 3-2-1 countdown. Settings are in `BLITZ` in `src/modes/blitz.ts`.

- Reaching a level adds 10 seconds × the new level number.
- Gems come 2 letters sooner (a 4-letter word earns green).
- Only 3-letter words can start a fire.
- **Gem blasts:** a gem used in a word explodes and destroys the tiles around it. Blasted tiles score their letter values, gems caught in a blast explode too, and blasts put out fires. Green and gold reach 1 step, sapphire and diamond 2, crystal 3. Classic gems don't explode.
- A round is never saved.

## Online leaderboards

- There's one board each for Classic and Blitz, showing the top 10. There are no accounts: a score is 3 initials (A–Z), the score, the level and the best word.
- The service is a Cloudflare Worker with a D1 database, in `server/` (see `server/README.md`). The game finds it through the `VITE_LEADERBOARD_URL` build setting. Without that setting, the leaderboard is hidden and only local scores show.
- **Game over** shows the online top 10 straight away. A score that makes it is slotted in at its place, highlighted, with a box for initials. **Post** sits in the bottom row with Home and Play again, and stays disabled until 3 letters are typed.
- **Offline**, scores wait in a queue on the device (up to 10) and post when the game is back online. The game remembers each board's 10th-place score so it can tell, offline, whether a score would qualify.
- The service checks initials (3 letters, plus a short blocklist), board names and a score cap per board, and rate-limits posts. It doesn't check that scores are real; replaying games on the server is a possible later fix.

## Adventure (feature flag `VITE_FEATURE_ADVENTURE`, on by default)

Rapunzel fights enemies above a 4×4 board, on one portrait screen.

**Screen layout, top to bottom:**
- the top bar: the stage label and name, the battle chip, the menu (gear) button top right, and both health bars;
- the arena: Rapunzel facing the enemy, with a speech bubble;
- the word bar: the picked tiles, with the damage working underneath;
- three artifact slots, the board, and an enemy notes panel (next hit and powers);
- Scramble and Attack!

**The board is not like Classic's:**
- Tap tiles **anywhere**, in any order; they don't have to touch. Each tapped tile moves up into the word bar and leaves an empty slot.
- Tap a tile in the word bar to return it and every tile after it.
- When you attack, the used tiles are gone for good: the columns fall and new tiles drop in on top. The only thing Adventure shares with Classic is the dictionary (plus the tile, random and goat helpers).

**Battle:**
- Every word is an attack. Damage is letter values × a length multiplier × gem multipliers × any artifact boost, and then the enemy's powers change it. The enemy hits back after every word.
- **Scramble** gives all new letters, but the enemy gets a free hit.
- A word of 5+ letters leaves a gem in the refill.
- **Overkill:** damage past an enemy's last point of health heals Rapunzel, up to full health (`overkillHeal` in tuning). A glowing "+N" arcs from the enemy into her. This is the only healing.
- Health carries from one battle to the next within a stage. Losing restarts that battle with the health and artifacts she had when it began.

**Stages (`STAGES` in `enemies.ts`):**

| Stage | Label | Rapunzel starts at | Enemies (health) | Clearing it |
|---|---|---|---|---|
| The Tower Road | Tutorial | 30/30 | Hay Dummy (30), Moss Troll (24), Frost Troll (30), Ember Troll (38) | wins the Golden Troll Horn |
| The Murky Swamp | Chapter 1 | 10/30 | Mire Toad (40), Bog Lurker (52), Swamp Hag (66) | no reward yet; Play again restarts the swamp |

- **Tutorial:** the Hay Dummy is a scripted lesson (`tutorial.ts`) with a fixed board and fixed refills: spell CAT, HORSE, then GOAT using the gem, then Scramble, then any word. The dummy can't drop below 1 health until the steps are done. **Skip tutorial** jumps to the first troll.
- Each enemy has powers that change damage or hits, e.g. "words with an S do 2 less damage" or "every third hit does double". The powers are listed in the notes panel.
- A power can **mark** the letters it affects (`marks` on the power), shown on the board and in the word bar. A **hex** is light red with a small ✶ (the Swamp Hag hexes E). **Frost** is icy teal with a ❄ (the Frost Troll freezes S); its teal is kept clear of the sapphire and diamond gem blues.
- Each stage has its own scenery (`data-biome` on the screen: `mountain` or `swamp`).

**Artifacts (`artifacts.ts`, numbers in `tuning.ts`):**
- Rapunzel has 3 slots, which start as empty dashed holders. Artifacts are kept for good, across runs.
- **Golden Troll Horn:** tap it before attacking and the next word does ×2 damage; tap again to cancel. It then needs 2 words of 6+ letters to recharge, shown as dots on its slot, and glows when ready.
- The old consumable power-ups (apple, hay bale, braid) were removed in favour of artifacts.

**Menu:** the gear button in the top bar opens a menu: **Restart level** (back to the first battle of the current stage, at its starting health, keeping artifacts), **Restart game** (back to the Tower Road tutorial, losing all progress and artifacts), **Go home** and **Keep playing**. Both restarts ask for confirmation.

**Saving (`save.ts`):** the run is saved after every turn: the stage, battle, health, board, tutorial step and artifacts. Reopening Adventure carries on. Closing on a victory card resumes at the next battle, and closing after a loss resumes at the start of the lost battle.

**Art:** the enemy drawings are placeholders. The Moss and Frost Trolls share `art/troll.svg` and swamp enemies share `art/bogbeast.svg`, each tinted with a CSS hue. The Ember Troll has its own drawing, `art/embertroll.svg`, with gold horns; the Golden Troll Horn (`art/goldenhorn.svg`) is one of them.

## Look and sound

- The palette is night teal with marigold, birch-wood tiles and gem colours. Rapunzel is an SVG (`art/rapunzel.svg`) with animated parts; see `replacegraphics.md` for how to redraw her.
- Sounds are in `audio/export/*.wav`, made in Audacity (`.aup3` project files are not committed):

| Sound | When it plays |
|---|---|
| `welcometobookgoat` | the greeting on the home screen; her jaw follows its loudness |
| `tileselect` | picking a tile |
| `word_power` | the selection becomes a valid word; pitched up a semitone per letter past 3 (up to +9) |
| `gemspawn` | a gem appears; a semitone higher for each better gem |
| `boardreset` | a new board drops in, and Scramble |
| `good` / `prettygood` | Rapunzel's praise when the selection becomes a valid 6-letter word (one of the two at random) |
| `nice` | praise for a valid 7-letter word |
| `excellent` | praise for a valid 8+ letter word |

Voice lines move Rapunzel's jaw with the sound. `npm run lipsync` (`scripts/make-lipsync.mjs`) reads each voice line's WAV and saves its jaw positions, 30 a second, as `audio/export/<name>.jaw.json`. `lipSync` in `src/ui/voice.ts` plays them back in time with the clip. The praise lines play in every mode, from whichever Rapunzel is on screen. A line that's still playing is never cut off: if the next long word comes too soon, its line is skipped. The word lengths are `PRAISE` in `src/main.ts`.

## Ideas not built yet

- Real enemy art, and more artifacts and stages. The second-stage reward is still to be decided.
- Server-side score checking, and daily boards (scores are already stored per board id, so a daily board is just a new id).
- Whether "Play again" after the Tower Road should skip the dummy once the horn is owned.
