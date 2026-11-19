// Adventure mode: Rapunzel battles enemies above a 4×4 board. Tap tiles in any order to build a word; each
// one moves up into the word bar. Every word is an attack, and the enemy hits back after each one.
// Board rules are in rules.ts, numbers in tuning.ts, enemies in enemies.ts, the tutorial in tutorial.ts, artifacts in
// artifacts.ts. The run is saved after every turn (save.ts), so closing the game and coming back carries on.
import './adventure.css';
import gearSvg from '../../art/gear.svg?raw';
import rubbleSvg from '../../art/rubble.svg?raw';
import { TileFactory, type Pos, type Tile } from '../engine/board';
import { Rng } from '../engine/rng';
import type { GemKind } from '../engine/rules';
import { dict } from '../modes/mode';
import { Goat } from '../ui/goat';
import { STAGES, firstBattle, stagesFor, unlockedBefore, type Enemy } from './enemies';
import { TUTORIAL, TUTORIAL_BOARD, TUTORIAL_DONE, TUTORIAL_REFILLS, type TutorialStep } from './tutorial';
import { SIZE, damageFor, gemTile, gemsOn, makeBoard, num, placeGems, refill, smashTile, tilesFor, type Board, type PlacedGem } from './rules';
import { DIFFICULTY, TUNING, gemForLength, type Difficulty } from './tuning';
import { ARTIFACTS, chargeAfterWord, chargeForBattle, describe, fullCharge, isReady, shieldBlock, spec, type ArtifactId, type OwnedArtifact } from './artifacts';
import { loadArtifacts, loadRun, saveArtifacts, saveRun } from './save';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const inlineSvg = (svg: string) => svg.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, '').trim();
const same = (a: Pos, b: Pos) => a.c === b.c && a.r === b.r;

export interface AdventureHost {
  /** Back to the home screen. */
  home(): void;
  tileSelected(): void;
  /** Called with the word whenever the tray is redrawn, or '' when it isn't a valid word. */
  wordFormed(word: string): void;
  gemSpawned(kind: GemKind): void;
  boardDropped(): void;
}

export function createAdventure(host: AdventureHost) {
  const screen = $('adventure');
  const boardEl = $('adv-board');
  const goat = new Goat($('adv-goat'));

  const rng = new Rng((Math.random() * 2 ** 32) >>> 0);
  const factory = new TileFactory(rng);
  let board: Board = [];
  /** The tiles moved up into the word, in order. Their places on the board stay empty until the attack. */
  let selection: Pos[] = [];
  let busy = false;
  let stage = 0;
  let battle = 0;
  let heroHp: number = TUNING.hero.hp;
  let startHp: number = TUNING.hero.hp; // health at the start of this battle, for a retry
  let enemyHp = 0;
  let enemyTurns = 0;
  /** Artifacts Rapunzel owns, kept between runs, and how they stood when this battle began (for a retry). */
  let artifacts: OwnedArtifact[] = loadArtifacts();
  let startArtifacts: OwnedArtifact[] = artifacts;
  /** Artifacts switched on: the horn waits for the next word, the shield for the next hit, the hammer for a tile tap. */
  let armed: ArtifactId[] = [];
  /** Rapunzel's health when this stage began, for Restart chapter. */
  let chapterHp: number = TUNING.hero.hp;
  /** Her artifacts when this stage began, for Restart chapter. */
  let chapterArtifacts: OwnedArtifact[] = artifacts;
  /** Gems carried into this battle and into this stage (Medium and Hard), for a retry and Restart chapter. */
  let startGems: PlacedGem[] = [];
  let chapterGems: PlacedGem[] = [];
  /** Index into TUTORIAL while the tutorial is running, otherwise -1. */
  let step = -1;
  let refills: string[] = [];
  /** Chosen when the run began. The stages' enemies are built for it. */
  let difficulty: Difficulty = 'easy';
  let stages = STAGES;
  const enemies = () => stages[stage].enemies;
  const enemy = () => enemies()[battle];
  const tutorialStep = (): TutorialStep | null => (step >= 0 ? TUTORIAL[step] : null);

  /* ---------- Board ---------- */

  /** A new tile: the tutorial's next scripted letter if there is one, otherwise random. */
  function makeTile(): Tile {
    const t = factory.make(board);
    const scripted = refills.shift();
    if (scripted) {
      t.letter = scripted.replace('*', '');
      if (scripted.endsWith('*')) t.fresh = true; // marks the tile that becomes the gem
    }
    return t;
  }

  function fillBoard(rows?: string[]) {
    board = makeBoard((b) => factory.make(b), rows);
  }

  const at = (p: Pos) => board[p.c][p.r];
  const wordOf = (path: Pos[]) => path.map((p) => at(p).letter.toLowerCase()).join('');
  const word = () => wordOf(selection);
  const isWord = () => word().length >= TUNING.minWordLength && dict.has(word());

  const boost = () => (armed.includes('goldenHorn') ? { multiplier: spec('goldenHorn').multiplier ?? 1, name: 'horn' } : undefined);
  const damage = (path = selection) => damageFor(path.map(at), enemy(), boost(), enemyTurns + 1);
  /** Whether the enemy's shield is up for the word being played now. */
  const shieldUp = () => enemy().powers.some((p) => p.shieldUp?.(enemyTurns + 1));

  /** How hard the enemy's next hit will be. */
  function nextHit() {
    const e = enemy();
    const info = hitInfo();
    return Math.round(e.powers.reduce((h, p) => p.hit?.(h, info) ?? h, e.hit));
  }
  const hitInfo = () => ({ turn: enemyTurns + 1, health: enemyHp / enemy().hp });

  /** How one of the enemy's powers marks this tile's letter ('hex' or 'frost'), if it does. */
  const markOf = (t: Tile) => t.rubble ? undefined : enemy().powers.find((p) => p.marks?.letters.includes(t.letter))?.marks?.style;
  const MARK_NAMES = { hex: 'hexed', frost: 'frozen' };

  const tileFace = (t: Tile) => {
    const v = TUNING.letterDamage[t.letter] ?? 1;
    return `<div class="tile-face"><span class="tile-letter${t.letter === 'Qu' ? ' qu' : ''}">${t.letter}</span><span class="tile-value">${v !== 1 ? num(v) : ''}</span></div>`;
  };

  /** Draw the board; tiles listed in `fresh` drop in. */
  function renderBoard(fresh = new Set<number>()) {
    boardEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const t = board[c][r];
        const el = document.createElement('div');
        el.dataset.c = String(c);
        el.dataset.r = String(r);
        el.dataset.id = String(t.id);
        el.className = 'tile adv-tile';
        if (fresh.has(t.id)) el.classList.add('drop');
        if (t.rubble) {
          el.classList.add('rubble');
          el.setAttribute('role', 'gridcell');
          el.setAttribute('aria-label', 'Rubble');
          el.innerHTML = `<div class="tile-face">${inlineSvg(rubbleSvg)}</div>`;
          boardEl.appendChild(el);
          continue;
        }
        el.classList.toggle('gem', t.kind !== 'normal');
        const mark = markOf(t);
        if (mark) el.dataset.mark = mark;
        el.dataset.kind = t.kind;
        el.setAttribute('role', 'gridcell');
        el.setAttribute('aria-label', `${t.letter}${t.kind !== 'normal' ? ` (${t.kind} gem)` : ''}${mark ? ` (${MARK_NAMES[mark]})` : ''}`);
        el.innerHTML = tileFace(t);
        boardEl.appendChild(el);
      }
    renderSelection();
  }

  /** May the player use this right now? The tutorial allows only the step's action. */
  function allowed(action: 'word' | 'artifact'): boolean {
    if (busy) return false;
    return !tutorialStep() || action === 'word';
  }

  function renderSelection() {
    boardEl.classList.toggle('hammering', armed.includes('hammer'));
    const s = tutorialStep();
    const wanted = s?.action === 'word' && s.word ? s.word : null;
    // Point at the tiles still needed for the tutorial's word.
    const w = word();
    const hint = wanted ? (tilesFor(board, wanted.startsWith(w) ? wanted.slice(w.length) : wanted, selection) ?? []) : [];
    for (const el of boardEl.querySelectorAll<HTMLElement>('.adv-tile')) {
      const p = { c: Number(el.dataset.c), r: Number(el.dataset.r) };
      el.classList.toggle('taken', selection.some((q) => same(q, p)));
      el.classList.toggle('hint', hint.some((q) => same(q, p)));
    }

    // The word bar holds the picked tiles; tap one to put it back.
    const tray = $('adv-word');
    const grew = selection.length > tray.children.length;
    tray.innerHTML = '';
    selection.forEach((p, i) => {
      const t = at(p);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tile adv-tray-tile${t.kind !== 'normal' ? ' gem' : ''}${grew && i === selection.length - 1 ? ' new' : ''}`;
      b.dataset.kind = t.kind;
      const mark = markOf(t);
      if (mark) b.dataset.mark = mark;
      b.setAttribute('aria-label', i === selection.length - 1 ? `Put back ${t.letter}` : `Put back ${t.letter} and the letters after it`);
      b.innerHTML = tileFace(t);
      b.addEventListener('click', () => unpick(i));
      tray.appendChild(b);
    });
    host.wordFormed(isWord() ? w : '');
    const bar = $('adv-word-bar');
    bar.classList.toggle('valid', isWord());
    bar.classList.toggle('invalid', !!w && !isWord());

    const dmgEl = $('adv-damage');
    if (wanted && w && !wanted.startsWith(w)) dmgEl.textContent = `Try ${wanted.toUpperCase()}: tap a letter above to take it back`;
    else if (isWord() && wanted && w !== wanted) dmgEl.textContent = `Try ${wanted.toUpperCase()}`;
    else if (isWord()) {
      const d = damage();
      dmgEl.innerHTML = `<span class="adv-math">${d.math}</span> <b>⚔ ${d.total}</b>`;
    } else if (w.length && w.length < TUNING.minWordLength) dmgEl.textContent = `${TUNING.minWordLength}+ letters`;
    else dmgEl.textContent = w ? 'Not a word' : 'Tap letters to spell a word';
    $<HTMLButtonElement>('adv-attack').disabled = !allowed('word') || !isWord() || (!!wanted && w !== wanted);
    renderPowers();
  }

  /** Tap a tile on the board: it moves up to the end of the word. */
  function pick(p: Pos) {
    if (!allowed('word') || selection.some((q) => same(q, p))) return;
    if (at(p).rubble) return say("That's rubble. I can't spell with it.");
    selection.push(p);
    host.tileSelected();
    renderSelection();
  }

  /** Tap a tile in the word: it and every tile after it go back to their places on the board. */
  function unpick(i: number) {
    if (busy) return;
    selection = selection.slice(0, i);
    renderSelection();
  }

  /** With the hammer switched on, a tapped tile breaks: its column drops and a new tile falls in. Gems are safe. */
  function smash(p: Pos) {
    if (busy) return;
    if (at(p).kind !== 'normal') return say("Not the gem! The hammer won't break those.");
    const wasRubble = at(p).rubble;
    armed = armed.filter((a) => a !== 'hammer');
    artifacts = artifacts.map((a) => (a.id === 'hammer' ? { ...a, charge: 0 } : a));
    selection = []; // the column shifts, so anything picked goes back
    const created = refill(board, [p], makeTile);
    for (const t of created) delete t.fresh;
    say(wasRubble ? 'Crack! The rubble is gone and a new letter drops in.' : 'Crack! A new letter drops in.');
    host.tileSelected();
    renderHealth();
    renderBoard(new Set(created.map((t) => t.id)));
    save();
  }

  boardEl.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.adv-tile');
    if (!el) return;
    const p = { c: Number(el.dataset.c), r: Number(el.dataset.r) };
    if (armed.includes('hammer')) smash(p);
    else pick(p);
  });

  /* ---------- Beside the board ---------- */

  /** The artifact slots beside the board: owned artifacts first, then empty holders. */
  function renderPowers() {
    const box = $('adv-powers');
    box.innerHTML = '';
    for (let i = 0; i < TUNING.artifactSlots; i++) {
      const owned = artifacts[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'adv-power';
      if (!owned) {
        b.classList.add('empty');
        b.disabled = true;
        b.setAttribute('aria-label', 'Empty artifact slot');
        b.title = 'Empty artifact slot';
        box.appendChild(b);
        continue;
      }
      const info = ARTIFACTS[owned.id];
      const ready = isReady(owned);
      const pips = Array.from({ length: fullCharge(owned.id) }, (_, k) => `<i${k < owned.charge ? ' class="on"' : ''}></i>`).join('');
      b.innerHTML = `<span class="adv-power-icon">${info.icon}</span><span class="adv-charge" aria-hidden="true">${pips}</span>`;
      const on = armed.includes(owned.id);
      b.disabled = !ready || !allowed('artifact');
      b.classList.toggle('ready', !b.disabled && !on);
      b.classList.toggle('active', on);
      b.title = `${info.name}: ${describe(owned.id)}`;
      b.setAttribute('aria-label', `${info.name}, ${on ? 'switched on' : ready ? 'charged' : `charging, ${owned.charge} of ${fullCharge(owned.id)}`}: ${describe(owned.id)}`);
      b.addEventListener('click', () => useArtifact(owned.id));
      box.appendChild(b);
    }
  }

  function renderInfo() {
    const e = enemy();
    const hit = nextHit();
    $('adv-info').innerHTML =
      `<h3 class="adv-info-name">${e.name}</h3>` +
      `<p class="adv-info-hit">⚔ Next hit: ${hit}${hit !== e.hit ? ` <span class="adv-info-base">(usually ${e.hit})</span>` : ''}</p>` +
      `<span class="label">Powers</span>` +
      (e.powers.length
        ? `<ul class="adv-info-powers">${e.powers.map((p) => `<li><b>${p.name}</b>${p.shieldUp?.(enemyTurns + 1) ? ' <span class="adv-info-up">up now</span>' : ''} ${p.text}</li>`).join('')}</ul>`
        : `<p class="adv-info-none">None. It's just hay.</p>`);
  }

  /** Tap a charged artifact to switch it on; tap again to put it away without using it. */
  function useArtifact(id: ArtifactId) {
    if (!allowed('artifact')) return;
    if (armed.includes(id)) armed = armed.filter((a) => a !== id);
    else {
      armed = [...armed, id];
      if (id === 'goldenHorn') say(`The ${ARTIFACTS[id].name} glows! My next word does ×${spec(id).multiplier} damage.`);
      else if (id === 'shield') say(`Shield up! The next hit does ${spec(id).block} less damage.`);
      else {
        selection = [];
        say('Tap a tile to smash it with the hammer.');
      }
    }
    renderHealth();
    renderSelection();
    save();
  }

  /* ---------- Battle ---------- */

  function say(text: string) {
    $('adv-bubble').textContent = text;
  }

  function renderHealth() {
    const e = enemy();
    const max = TUNING.hero.hp;
    $('adv-hero-hp').style.width = `${(heroHp / max) * 100}%`;
    $('adv-hero-hp-text').textContent = `${heroHp}/${max}`;
    $('adv-enemy-hp').style.width = `${(enemyHp / e.hp) * 100}%`;
    $('adv-enemy-hp-text').textContent = `${enemyHp}/${e.hp}`;
    $('adv-hero-bar').classList.toggle('low', heroHp <= max * 0.3);
    $('adv-hero-status').innerHTML = armed.map((a) => ARTIFACTS[a].icon).join('');
    goat.setWorried(heroHp > 0 && heroHp <= max * 0.3);
    $('adv-enemy-wrap').classList.toggle('guarded', shieldUp() && enemyHp > 0);
    renderInfo();
  }

  /** A number that floats up from a fighter. */
  function pop(fighter: 'hero' | 'enemy', text: string, kind = '') {
    const el = document.createElement('span');
    el.className = `adv-pop ${kind}`;
    el.textContent = text;
    $(fighter === 'hero' ? 'adv-hero' : 'adv-enemy-wrap').appendChild(el);
    window.setTimeout(() => el.remove(), 1000);
  }

  /**
   * Overkill: a glowing "+N" leaves the beaten enemy and arcs across the arena into Rapunzel, trailing little
   * plus sparks. Resolves when it lands.
   */
  async function flyHeal(amount: number) {
    const arena = document.querySelector<HTMLElement>('.adv-arena')!;
    const box = arena.getBoundingClientRect();
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height * 0.45 - box.top };
    };
    const from = centre($('adv-enemy-wrap'));
    const to = centre($('adv-hero'));
    const orb = document.createElement('span');
    orb.className = 'adv-heal-orb';
    orb.textContent = `+${amount}`;
    orb.style.left = `${from.x}px`;
    orb.style.top = `${from.y}px`;
    arena.appendChild(orb);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await wait(300);
      return orb.remove();
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lift = -Math.max(40, box.height * 0.35); // how high the arc rises
    const point = (t: number) => ({ x: dx * t, y: dy * t + lift * 4 * t * (1 - t) });
    const frames: Keyframe[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const p = point(t);
      const scale = k === 0 ? 0.4 : k < 3 ? 1.25 : 1.25 - 0.45 * t;
      frames.push({ offset: t, transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px)) scale(${scale})` });
    }
    const duration = 750;
    // Sparks drop off the orb along the way and fade.
    for (let i = 0; i < 6; i++) {
      window.setTimeout(() => {
        const p = point((i + 1) / 7);
        const spark = document.createElement('span');
        spark.className = 'adv-heal-spark';
        spark.textContent = '+';
        spark.style.left = `${from.x + p.x}px`;
        spark.style.top = `${from.y + p.y}px`;
        arena.appendChild(spark);
        const drift = (Math.random() - 0.5) * 24;
        spark.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9 },
            { transform: `translate(calc(-50% + ${drift}px), calc(-50% + 18px)) scale(0.5)`, opacity: 0 },
          ],
          { duration: 500, easing: 'ease-out' },
        ).onfinish = () => spark.remove();
      }, (duration * (i + 1)) / 7);
    }
    await orb.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' }).finished;
    orb.remove();
  }

  function hurt(id: string) {
    const el = $(id);
    el.classList.remove('hurt');
    void el.offsetWidth; // restart the animation
    el.classList.add('hurt');
  }

  /** The tutorial moves on: say the next step, or end it after the last one. */
  function advance() {
    if (step < 0) return;
    step++;
    if (step >= TUTORIAL.length) {
      step = -1;
      refills = [];
      say(TUTORIAL_DONE);
    } else say(TUTORIAL[step].say);
    renderSelection();
  }

  async function attack() {
    if (!allowed('word') || !isWord()) return;
    const s = tutorialStep();
    if (s?.action === 'word' && s.word && word() !== s.word) return;
    busy = true;
    const { total } = damage();
    const used = selection;
    const w = word();
    const usedGem = used.some((p) => at(p).kind !== 'normal');
    // Long words charge the horn; if it was switched on, this word spends it (and doesn't count toward recharging it).
    const hornOn = armed.includes('goldenHorn');
    artifacts = chargeAfterWord(artifacts, w.length);
    if (hornOn) artifacts = artifacts.map((a) => (a.id === 'goldenHorn' ? { ...a, charge: 0 } : a));
    armed = armed.filter((a) => a !== 'goldenHorn');
    busyRender();

    goat.react('chew');
    $('adv-hero').classList.add('lunge');
    await wait(220);
    $('adv-hero').classList.remove('lunge');
    // In the tutorial the dummy stays up until every step is done.
    const overkill = Math.max(0, total - enemyHp);
    enemyHp = Math.max(step >= 0 ? 1 : 0, enemyHp - total);
    hurt('adv-enemy-wrap');
    pop('enemy', `−${total}`);
    say(`${w.toUpperCase()}! ${usedGem ? 'Gem power!' : 'Take that!'}`);
    // Damage past the enemy's last point of health flies back to heal Rapunzel.
    const heal = enemyHp <= 0 ? Math.min(Math.round(overkill * TUNING.overkillHeal), TUNING.hero.hp - heroHp) : 0;
    const healed =
      heal > 0 &&
      flyHeal(heal).then(() => {
        heroHp += heal;
        renderHealth();
        pop('hero', `+${heal}`, 'heal');
        goat.react('cheer');
      });
    if (heal > 0) say(`${w.toUpperCase()}! Overkill: Rapunzel gets ${heal} health back!`);

    // The used tiles are gone for good: the columns fall and new letters drop in on top.
    const created = refill(board, used, makeTile);
    const gem = gemForLength(w.length);
    if (gem && created.length) {
      // A gem is never a hexed or frozen letter. If every new tile is one, give one of them a fresh letter first.
      let tile = gemTile(created, (t) => !!markOf(t), (ts) => rng.pick(ts));
      if (!tile) {
        tile = rng.pick(created);
        for (let i = 0; i < 20 && markOf(tile); i++) tile.letter = factory.letter(board);
      }
      tile.kind = gem;
      host.gemSpawned(gem);
    }
    for (const t of created) delete t.fresh;
    selection = [];
    renderHealth();
    renderBoard(new Set(created.map((t) => t.id)));

    await Promise.all([wait(650), healed]);
    if (enemyHp <= 0) return win();
    await enemyTurn();
    if (heroHp > 0 && s?.action === 'word') advance();
    if (heroHp > 0) save();
  }

  /** Lock the buttons while the attack plays out, keeping the word in view. */
  function busyRender() {
    $<HTMLButtonElement>('adv-attack').disabled = true;
    renderPowers();
  }

  async function enemyTurn() {
    busy = true;
    renderSelection();
    const info = hitInfo();
    let hit = nextHit();
    enemyTurns++;
    $('adv-enemy-wrap').classList.add('lunge');
    await wait(220);
    $('adv-enemy-wrap').classList.remove('lunge');
    // A raised shield takes some of the hit, then it's spent until the next battle.
    const blocked = armed.includes('shield') ? shieldBlock(hit) : 0;
    if (armed.includes('shield')) {
      armed = armed.filter((a) => a !== 'shield');
      artifacts = artifacts.map((a) => (a.id === 'shield' ? { ...a, charge: 0 } : a));
      say(`My shield blocked ${blocked}!`);
      pop('hero', `🛡 ${blocked}`, 'heal');
    }
    hit -= blocked;
    heroHp = Math.max(0, heroHp - hit);
    if (hit > 0) {
      hurt('adv-hero');
      window.setTimeout(() => pop('hero', `−${hit}`), blocked ? 250 : 0);
    }
    renderHealth();
    if (heroHp <= 0) return lose();
    // Bash: the hit also smashes one of her tiles into rubble.
    const e = enemy();
    const smash = e.powers.find((p) => p.smash?.on(info))?.smash;
    const smashed = smash && smashTile(board, smash.max, (spots) => rng.pick(spots));
    if (smashed) {
      await wait(250);
      selection = [];
      renderBoard();
      boardEl.querySelector(`[data-c="${smashed.c}"][data-r="${smashed.r}"]`)?.classList.add('smashed');
      host.boardDropped();
      say(`The ${e.name} smashed one of my letters!`);
      await wait(300);
    } else if (shieldUp()) say(`The ${e.name}'s shield is up. My next word does less damage.`);
    await wait(400);
    busy = false;
    renderSelection();
  }

  /** The card over the battle. `body` is HTML (our own text only); `art` is a drawing shown large above the title. */
  function showResult(title: string, body: string, action: string, then: () => void, art = '') {
    $('adv-result-title').textContent = title;
    $('adv-result-text').innerHTML = body;
    $('adv-result-art').innerHTML = art;
    $('adv-result-art').hidden = !art;
    const btn = $<HTMLButtonElement>('adv-result-go');
    btn.textContent = action;
    btn.onclick = () => {
      $('adv-result').hidden = true;
      then();
    };
    $('adv-result').hidden = false;
    btn.focus();
  }

  /** Save the run as it stands, and the artifacts. */
  function save() {
    saveArtifacts(artifacts);
    saveRun({
      stage,
      difficulty,
      battle,
      startHp,
      chapterHp,
      chapterArtifacts,
      startArtifacts,
      startGems,
      chapterGems,
      live: { heroHp, enemyHp, enemyTurns, board, step, refills, armed },
    });
  }

  function win() {
    goat.react('cheer');
    $('adv-enemy-wrap').classList.add('defeated');
    const e = enemy();
    say(e.tutorial ? 'I think I got the hang of it!' : 'Ha! Too easy.');
    const here = stages[stage];
    if (battle < enemies().length - 1) {
      // Health and artifacts (and on Medium and Hard, gems) carry from one battle to the next. Leaving the tutorial
      // dummy, she has full health.
      const carry = { hp: e.tutorial ? TUNING.hero.hp : heroHp, artifacts, gems: carriedGems() };
      saveArtifacts(artifacts);
      saveRun({ stage, difficulty, battle: battle + 1, startHp: carry.hp, chapterHp, chapterArtifacts, startArtifacts: artifacts, startGems: carry.gems, chapterGems });
      const text = e.tutorial ? 'Time for a real fight.' : `The ${e.name} slinks away. Rapunzel goes on with ${heroHp}/${TUNING.hero.hp} health.`;
      window.setTimeout(() => showResult(e.tutorial ? 'Tutorial done!' : 'Victory!', text, 'Next battle', () => startBattle(stage, battle + 1, carry)), 700);
      return;
    }
    // Clearing a stage wins its treasure, which she keeps from now on, and moves on to the next stage (or replays
    // the last one there is). The next stage starts with her health as it is now if it says so, or its own.
    const reward = here.reward;
    const isNew = !!reward && !artifacts.some((a) => a.id === reward) && artifacts.length < TUNING.artifactSlots;
    if (reward && isNew) artifacts = [...artifacts, { id: reward, charge: fullCharge(reward) }];
    renderPowers();
    const to = Math.min(stage + 1, stages.length - 1);
    const onward = to !== stage;
    const next = stages[to];
    const hp = onward && next.carryHp ? heroHp : (next.startHp ?? TUNING.hero.hp);
    saveArtifacts(artifacts);
    const gems = onward ? carriedGems() : []; // Play again starts the last stage fresh
    saveRun({ stage: to, difficulty, battle: 0, startHp: hp, chapterHp: hp, chapterArtifacts: artifacts, startArtifacts: artifacts, startGems: gems, chapterGems: gems });
    const go = () => startBattle(to, 0, { hp, artifacts, gems });
    const action = onward ? 'Onward' : 'Play again';
    const cleared = `Rapunzel made it through ${here.name}.${onward ? ` Next: ${next.name}.` : ''}`;
    const discovered = () => {
      const info = ARTIFACTS[reward!];
      showResult(
        'Artifact discovered!',
        `<p class="adv-result-name">${info.name}</p><p><b>Power:</b> ${info.power()}</p><p><b>Charging:</b> ${info.charging()}</p>`,
        action,
        go,
        info.icon,
      );
    };
    window.setTimeout(() => showResult(`${here.name} cleared!`, cleared, isNew ? 'Continue' : action, isNew ? discovered : go), 700);
  }

  function lose() {
    goat.setSad(true);
    say('Ow… I need a nap.');
    // Coming back after closing the game also starts this battle again.
    saveArtifacts(startArtifacts);
    saveRun({ stage, difficulty, battle, startHp, chapterHp, chapterArtifacts, startArtifacts, startGems, chapterGems });
    const retry = { hp: startHp, artifacts: startArtifacts, gems: startGems };
    window.setTimeout(() => showResult('Rapunzel needs a rest', `The ${enemy().name} wins this time.`, 'Try again', () => startBattle(stage, battle, retry)), 700);
  }

  /**
   * Start battle `n` of stage `s` with what `carry` holds (the health and artifacts left after the last battle, or
   * what she had when this battle first began, for a retry). Otherwise she has the artifacts she owns, and the
   * stage's starting health (full unless the stage says otherwise).
   */
  /** The gems she takes into the next fight: the ones on the board, on difficulties that carry them. */
  const carriedGems = () => (DIFFICULTY[difficulty].carryGems ? gemsOn(board) : []);

  function startBattle(s: number, n: number, carry?: { hp: number; artifacts: OwnedArtifact[]; gems?: PlacedGem[] }) {
    stage = s;
    battle = n;
    const e = enemy();
    const here = stages[stage];
    heroHp = startHp = carry?.hp ?? (n === 0 ? (here.startHp ?? TUNING.hero.hp) : TUNING.hero.hp);
    enemyHp = e.hp;
    enemyTurns = 0;
    artifacts = startArtifacts = chargeForBattle(carry?.artifacts ?? artifacts); // the shield and hammer refill every battle
    startGems = carry?.gems ?? [];
    if (n === firstBattle(s, difficulty)) {
      chapterHp = heroHp;
      chapterArtifacts = artifacts;
      chapterGems = startGems;
    }
    armed = [];
    busy = false;
    selection = [];
    step = e.tutorial ? 0 : -1;
    refills = e.tutorial ? [...TUTORIAL_REFILLS] : [];
    goat.setSad(false);
    const wrap = $('adv-enemy-wrap');
    wrap.classList.remove('defeated', 'hurt');
    wrap.style.setProperty('--hue', `${e.hue ?? 0}deg`);
    $('adv-enemy').innerHTML = inlineSvg(e.art);
    $('adv-enemy-name').textContent = e.name;
    const fights = enemies().filter((x) => !x.tutorial);
    $('adv-battle').textContent = e.tutorial ? 'Tutorial' : `Battle ${fights.indexOf(e) + 1} / ${fights.length}`;
    $('adv-chapter').textContent = here.label;
    $('adv-stage').textContent = here.name;
    screen.dataset.biome = here.biome;
    $('adv-skip').hidden = !e.tutorial;
    say(e.tutorial ? TUTORIAL[0].say : e.taunt);
    fillBoard(e.tutorial ? TUTORIAL_BOARD : undefined);
    // Carried gems go back in their places. A gem is never a letter this enemy hexes or freezes, so such a gem gets a
    // fresh letter (it keeps its kind).
    if (!e.tutorial) for (const t of placeGems(board, startGems)) for (let i = 0; i < 20 && markOf(t); i++) t.letter = factory.letter(board);
    renderHealth();
    renderBoard(new Set(board.flat().map((t) => t.id)));
    host.boardDropped();
    save();
  }

  /** Carry on the saved run: its battle, and the board and health as they were if it was under way. */
  function resume(): boolean {
    const run = loadRun();
    const s = run?.stage ?? 0;
    if (!run || !STAGES[s]?.enemies[run.battle]) return false;
    difficulty = run.difficulty && DIFFICULTY[run.difficulty] ? run.difficulty : 'easy';
    stages = stagesFor(difficulty);
    const owned = loadArtifacts(); // read before startBattle saves over it
    startBattle(s, run.battle, { hp: run.startHp, artifacts: run.startArtifacts, gems: run.startGems });
    chapterHp = run.chapterHp ?? (run.battle === 0 ? run.startHp : (stages[s].startHp ?? TUNING.hero.hp));
    chapterArtifacts = run.chapterArtifacts ?? (run.battle === 0 ? run.startArtifacts : owned); // older saves; Restart chapter trims extras
    chapterGems = run.chapterGems ?? [];
    const live = run.live;
    if (!live) return true;
    heroHp = live.heroHp;
    enemyHp = live.enemyHp;
    enemyTurns = live.enemyTurns;
    board = live.board;
    step = live.step < TUTORIAL.length ? live.step : -1; // saves from when the tutorial had a Scramble step
    refills = live.refills;
    artifacts = owned;
    // Older saves kept a single switched-on artifact, or none.
    const wasOn: ArtifactId[] = Array.isArray(live.armed) ? live.armed : live.armed ? [live.armed] : [];
    armed = wasOn.filter((id) => artifacts.some((a) => a.id === id && isReady(a)));
    factory.nextId = Math.max(factory.nextId, ...board.flat().map((t) => t.id + 1));
    $('adv-skip').hidden = step < 0;
    say(step >= 0 ? TUTORIAL[step].say : `Back for more? The ${enemy().name} is waiting.`);
    renderHealth();
    renderBoard(new Set(board.flat().map((t) => t.id)));
    save();
    return true;
  }

  $('adv-attack').addEventListener('click', () => void attack());
  $('adv-skip').addEventListener('click', () => startBattle(stage, battle + 1, { hp: TUNING.hero.hp, artifacts }));
  /* ---------- Menu ---------- */

  /** Whether the menu card must be answered: Escape doesn't close it (choosing a difficulty for a new run). */
  let menuLocked = false;

  /** Fill the menu card: a title, a line of text and a column of buttons (`main` is the highlighted one, by default the last). */
  function menuCard(title: string, text: string, actions: { label: string; run: () => void }[], main = actions.length - 1) {
    menuLocked = false;
    $('adv-menu-title').textContent = title;
    $('adv-menu-text').textContent = text;
    const box = $('adv-menu-actions');
    box.innerHTML = '';
    actions.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${i === main ? 'btn-feed' : 'btn-quiet'}`;
      b.textContent = a.label;
      b.addEventListener('click', a.run);
      box.appendChild(b);
    });
    $('adv-menu').hidden = false;
    box.querySelector<HTMLElement>('.btn-feed')?.focus();
  }
  const closeMenu = () => ($('adv-menu').hidden = true);

  /** Start a new run on the difficulty the player picks. `cancel`, if given, goes back instead (otherwise they must pick). */
  function chooseDifficulty(cancel?: () => void) {
    const picks = (Object.keys(DIFFICULTY) as Difficulty[]).map((d) => ({ label: DIFFICULTY[d].label, run: () => newRun(d) }));
    menuCard(
      'Choose a difficulty',
      'Easy starts with a short tutorial. On Medium and Hard you go straight to the first troll, and the enemies are tougher.',
      cancel ? [...picks, { label: 'Cancel', run: cancel }] : picks,
      0,
    );
    menuLocked = !cancel;
  }

  /** A new run from the start of the Tower Road, with no artifacts. Easy begins with the tutorial dummy. */
  function newRun(d: Difficulty) {
    closeMenu();
    difficulty = d;
    stages = stagesFor(d);
    artifacts = [];
    saveArtifacts(artifacts);
    saveRun(null);
    startBattle(0, firstBattle(0, d));
  }

  /** The settings menu: restart this stage, start the whole adventure over, or go home. The run is already saved. */
  function openMenu() {
    if (busy) return; // let the attack finish first
    const here = stages[stage];
    const hp = chapterHp; // the health she arrived with
    // The artifacts she arrived with, minus any won by clearing this stage (on a replay): she wins those again.
    const kept = chapterArtifacts.filter((a) => unlockedBefore(stage).includes(a.id));
    menuCard('Menu', `${here.label}: ${here.name} · ${DIFFICULTY[difficulty].label}`, [
      {
        label: 'Restart chapter',
        run: () =>
          menuCard('Restart chapter?', `Back to the first battle of ${here.name}, with ${hp}/${TUNING.hero.hp} health and the artifacts you had when it began.`, [
            { label: 'Cancel', run: openMenu },
            { label: 'Restart chapter', run: () => (closeMenu(), startBattle(stage, firstBattle(stage, difficulty), { hp, artifacts: kept, gems: chapterGems })) },
          ]),
      },
      {
        label: 'Restart game',
        run: () =>
          menuCard('Restart the whole game?', `Start again from the Tower Road, on any difficulty. All progress is lost${artifacts.length ? ', and so are your artifacts' : ''}.`, [
            { label: 'Cancel', run: openMenu },
            { label: 'Start over', run: () => chooseDifficulty(openMenu) },
          ]),
      },
      {
        label: 'Go home',
        run: () => {
          closeMenu();
          screen.hidden = true;
          host.home();
        },
      },
      { label: 'Keep playing', run: closeMenu },
    ]);
  }

  $('adv-menu-open').innerHTML = inlineSvg(gearSvg);
  $('adv-menu-open').addEventListener('click', openMenu);
  window.addEventListener('keydown', (e) => {
    if (screen.hidden || busy) return;
    if (!$('adv-menu').hidden) return void (e.key === 'Escape' && !menuLocked && closeMenu());
    if (!$('adv-result').hidden) return;
    if (e.key === 'Enter') void attack();
    else if (e.key === 'Escape') {
      selection = [];
      renderSelection();
    } else if (e.key === 'Backspace' && selection.length) {
      e.preventDefault();
      unpick(selection.length - 1);
    } else if (/^[a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type a letter to pick a matching tile ("q" picks Qu).
      const p = tilesFor(board, e.key.toLowerCase() === 'q' ? 'qu' : e.key.toLowerCase(), selection)?.[0];
      if (p) pick(p);
    }
  });

  return {
    /** Show the screen, carrying on the saved run or starting at the tutorial. It sits under the home screen, so it can open as that fades. */
    open() {
      screen.hidden = false;
      $('adv-result').hidden = true;
      closeMenu();
      if (!resume()) chooseDifficulty();
    },
    isOpen: () => !screen.hidden,
  };
}
