# Replacing the Rapunzel graphics

Rapunzel is a vector drawing in `art/rapunzel.svg`. The game loads that file directly, so you replace her by redrawing it and saving over it. The same drawing is used on the start screen and in the game.

## Which program

**Inkscape** (free, on the Steam Deck's Discover store). It draws vector graphics, so she stays sharp at any size, and it's the only option that keeps her animations: chewing, talking, the open mouth, blinking, the ear twitch and the worried sweat drop.

**Krita** (also free) is the alternative if you'd rather paint than draw shapes. She'd become one flat PNG: she could still bounce when cheering and droop when sad, but her mouth, eyes and ears couldn't move on their own. You could keep some movement by exporting the moving parts as separate PNGs, but that's fiddlier and needs code changes.

## Steps

1. Open `art/rapunzel.svg` in Inkscape (**File → Open**). It opens at four times the game's size, so it's comfortable to work on.
2. Redraw her however you like: her face only, like now, or her whole body. You can edit the existing drawing or replace it outright.
3. Give each moving part its name (see below).
4. Save with **File → Save As → Plain SVG**, over `art/rapunzel.svg`. Plain SVG drops Inkscape's extra data that the game doesn't need.
5. Check her in the game (see "Seeing your changes").
6. Commit and push the file as usual to put her on the live site.

## Naming the moving parts

The game finds each moving part by its name. To name a part, select it, open the XML Editor (**Ctrl+Shift+X**) and add an attribute called `class` with the name as its value. If you redraw a part, keep its name on the new version.

| Name | What it is | What it does |
|---|---|---|
| `jaw` | mouth and chin, as one group | wobbles when she chews or talks, drops when she opens wide |
| `mouth` | the open mouth (dark inside, pink tongue), behind the jaw | appears when tiles fly at her; the tiles aim for it |
| `lid` | one closed eyelid per eye | hidden, briefly shown so she blinks |
| `pupil` | one per eye | shifts sideways when she's worried |
| `ear-l` | one ear | twitches now and then |
| `sweat` | a sweat drop | only shown when a fire is near the bottom |

Any part you leave out just won't animate. Nothing breaks.

## Things that will look wrong in Inkscape

The file has the eyelids closed, the sweat drop showing and the open mouth showing. The game hides them until they're needed, so in Inkscape her eyes look shut and her mouth looks open.

To work on her with her eyes open, use **Object → Layers and Objects** and click the eye icon next to the eyelids, the sweat drop and the open mouth to hide them.

**Turn them back on before you save.** If they're hidden when you save, they stay hidden in the game, and she'll never blink or open her mouth.

## Things to tell Claude about

The jaw and the ear swing around fixed points set in `src/style.css`, measured in the drawing's own units (the canvas is `viewBox="0 0 124 116"`):

- the jaw pivots at `60px 78px`
- the left ear pivots at `38px 44px`

If you **change the canvas size**, **move her mouth** or **move her left ear**, ask Claude to move these points to match your drawing. Otherwise the jaw or ear will swing from the wrong place.

Gradients, masks and clip paths are fine. The game renames their ids for each copy of her on the page, so the two copies don't clash.

## Seeing your changes

- **While working:** run `npm run dev` and open the address it prints. Each time you save in Inkscape, she updates in the browser straight away.
- **For the live site:** commit and push `art/rapunzel.svg`. The GitHub Action deploys it to https://mutantj.github.io/bookgoat/ a minute or two later.

## Checklist before you commit

- [ ] Saved as **Plain SVG** over `art/rapunzel.svg`
- [ ] Eyelids, sweat drop and open mouth switched back **on**
- [ ] `jaw`, `mouth`, `lid` ×2, `pupil` ×2, `ear-l` and `sweat` still named
- [ ] Jaw chews from the right place and the ear twitches from its base (if not, ask Claude to move the pivots)
- [ ] Looks right on the start screen and in the game, at phone size and desktop size
