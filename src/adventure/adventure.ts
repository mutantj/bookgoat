// Adventure mode: Rapunzel battles enemies above a 4×4 board. Tap tiles in any order to build a word; each
// one moves up into the word bar. Every word is an attack, and the enemy hits back after each one.
// Board rules are in rules.ts, numbers in tuning.ts, enemies in enemies.ts, the tutorial in tutorial.ts, artifacts in
// artifacts.ts. The run is saved after every turn (save.ts), so closing the game and coming back carries on.
import './adventure.css';
import gearSvg from '../../art/gear.svg?raw';
import { TileFactory, type Pos, type Tile } from '../engine/board';
import { Rng } from '../engine/rng';
import type { GemKind } from '../engine/rules';
import { dict } from '../modes/mode';
import { Goat } from '../ui/goat';
import { STAGES, type Enemy } from './enemies';
import { TUTORIAL, TUTORIAL_BOARD, TUTORIAL_DONE, TUTORIAL_REFILLS, type TutorialStep } from './tutorial';
import { SIZE, damageFor, makeBoard, num, refill, tilesFor, type Board } from './rules';
import { TUNING, gemForLength } from './tuning';
import { ARTIFACTS, chargeAfterWord, fullCharge, isReady, type ArtifactId, type OwnedArtifact } from './artifacts';
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
  /** The artifact triggered for the next word, if any. */
  let armed: ArtifactId | null = null;
  /** Index into TUTORIAL while the tutorial is running, otherwise -1. */
  let step = -1;
  let refills: string[] = [];
  const enemies = () => STAGES[stage].enemies;
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

  const boost = () => (armed ? { multiplier: TUNING.artifacts[armed].multiplier, name: 'horn' } : undefined);
  const damage = (path = selection) => damageFor(path.map(at), enemy(), boost());

  /** How hard the enemy's next hit will be. */
  function nextHit() {
    const e = enemy();
    const info = { turn: enemyTurns + 1, health: enemyHp / e.hp };
    return Math.round(e.powers.reduce((h, p) => p.hit?.(h, info) ?? h, e.hit));
  }

  /** How one of the enemy's powers marks this tile's letter ('hex' or 'frost'), if it does. */
  const markOf = (t: Tile) => enemy().powers.find((p) => p.marks?.letters.includes(t.letter))?.marks?.style;
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

  boardEl.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.adv-tile');
    if (el) pick({ c: Number(el.dataset.c), r: Number(el.dataset.r) });
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
      b.disabled = !ready || !allowed('artifact');
      b.classList.toggle('ready', !b.disabled && armed !== owned.id);
      b.classList.toggle('active', armed === owned.id);
      b.title = `${info.name}: ${info.text()}`;
      b.setAttribute('aria-label', `${info.name}, ${armed === owned.id ? 'ready for the next word' : ready ? 'charged' : `charging, ${owned.charge} of ${fullCharge(owned.id)}`}: ${info.text()}`);
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
        ? `<ul class="adv-info-powers">${e.powers.map((p) => `<li><b>${p.name}</b> ${p.text}</li>`).join('')}</ul>`
        : `<p class="adv-info-none">None. It's just hay.</p>`);
  }

  /** Tap a charged artifact to use it on the next word; tap again to put it away. */
  function useArtifact(id: ArtifactId) {
    if (!allowed('artifact')) return;
    if (armed === id) armed = null;
    else {
      armed = id;
      say(`The ${ARTIFACTS[id].name} glows! My next word does ×${TUNING.artifacts[id].multiplier} damage.`);
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
    $('adv-hero-status').innerHTML = armed ? ARTIFACTS[armed].icon : '';
    goat.setWorried(heroHp > 0 && heroHp <= max * 0.3);
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
    // The artifact is spent on this word; later long words recharge it.
    if (armed) artifacts = artifacts.map((a) => (a.id === armed ? { ...a, charge: 0 } : a));
    else artifacts = chargeAfterWord(artifacts, w.length);
    armed = null;
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
      (created.find((t) => t.fresh) ?? rng.pick(created)).kind = gem;
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
    const hit = nextHit();
    enemyTurns++;
    $('adv-enemy-wrap').classList.add('lunge');
    await wait(220);
    $('adv-enemy-wrap').classList.remove('lunge');
    heroHp = Math.max(0, heroHp - hit);
    hurt('adv-hero');
    pop('hero', `−${hit}`);
    renderHealth();
    if (heroHp <= 0) return lose();
    await wait(400);
    busy = false;
    renderSelection();
  }

  function showResult(title: string, text: string, action: string, then: () => void) {
    $('adv-result-title').textContent = title;
    $('adv-result-text').textContent = text;
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
      battle,
      startHp,
      startArtifacts,
      live: { heroHp, enemyHp, enemyTurns, board, step, refills, armed },
    });
  }

  function win() {
    goat.react('cheer');
    $('adv-enemy-wrap').classList.add('defeated');
    const e = enemy();
    say(e.tutorial ? 'I think I got the hang of it!' : 'Ha! Too easy.');
    const here = STAGES[stage];
    const last = battle === enemies().length - 1;
    let title = e.tutorial ? 'Tutorial done!' : 'Victory!';
    let text: string;
    let action = 'Next battle';
    let next: () => void;
    if (last) {
      // Clearing a stage wins its treasure, which she keeps from now on, and moves on to the next stage (or
      // replays the last one there is).
      const reward = here.reward;
      const isNew = !!reward && !artifacts.some((a) => a.id === reward) && artifacts.length < TUNING.artifactSlots;
      if (reward && isNew) artifacts = [...artifacts, { id: reward, charge: fullCharge(reward) }];
      renderPowers();
      const to = Math.min(stage + 1, STAGES.length - 1);
      const onward = to !== stage;
      title = `${here.name} cleared!`;
      text = `Rapunzel made it through ${here.name}.${reward && isNew ? ` She found the ${ARTIFACTS[reward].name}! ${ARTIFACTS[reward].text()}` : ''}${
        onward ? ` Next: ${STAGES[to].name}.` : ''
      }`;
      action = onward ? 'Onward' : 'Play again';
      saveArtifacts(artifacts);
      saveRun({ stage: to, battle: 0, startHp: STAGES[to].startHp ?? TUNING.hero.hp, startArtifacts: artifacts });
      next = () => startBattle(to, 0);
    } else {
      // Health and artifacts carry from one battle to the next. Leaving the tutorial dummy, she has full health.
      const carry = { hp: e.tutorial ? TUNING.hero.hp : heroHp, artifacts };
      saveArtifacts(artifacts);
      saveRun({ stage, battle: battle + 1, startHp: carry.hp, startArtifacts: artifacts });
      text = e.tutorial ? 'Time for a real fight.' : `The ${e.name} slinks away. Rapunzel goes on with ${heroHp}/${TUNING.hero.hp} health.`;
      next = () => startBattle(stage, battle + 1, carry);
    }
    window.setTimeout(() => showResult(title, text, action, next), 700);
  }

  function lose() {
    goat.setSad(true);
    say('Ow… I need a nap.');
    // Coming back after closing the game also starts this battle again.
    saveArtifacts(startArtifacts);
    saveRun({ stage, battle, startHp, startArtifacts });
    window.setTimeout(() => showResult('Rapunzel needs a rest', `The ${enemy().name} wins this time.`, 'Try again', () => startBattle(stage, battle, { hp: startHp, artifacts: startArtifacts })), 700);
  }

  /**
   * Start battle `n` of stage `s` with what `carry` holds (the health and artifacts left after the last battle, or
   * what she had when this battle first began, for a retry). Otherwise she has the artifacts she owns, and the
   * stage's starting health (full unless the stage says otherwise).
   */
  function startBattle(s: number, n: number, carry?: { hp: number; artifacts: OwnedArtifact[] }) {
    stage = s;
    battle = n;
    const e = enemy();
    const here = STAGES[stage];
    heroHp = startHp = carry?.hp ?? (n === 0 ? (here.startHp ?? TUNING.hero.hp) : TUNING.hero.hp);
    enemyHp = e.hp;
    enemyTurns = 0;
    artifacts = startArtifacts = carry?.artifacts ?? artifacts;
    armed = null;
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
    const owned = loadArtifacts(); // read before startBattle saves over it
    startBattle(s, run.battle, { hp: run.startHp, artifacts: run.startArtifacts });
    const live = run.live;
    if (!live) return true;
    heroHp = live.heroHp;
    enemyHp = live.enemyHp;
    enemyTurns = live.enemyTurns;
    board = live.board;
    step = live.step < TUTORIAL.length ? live.step : -1; // saves from when the tutorial had a Scramble step
    refills = live.refills;
    artifacts = owned;
    armed = live.armed && artifacts.some((a) => a.id === live.armed && isReady(a)) ? live.armed : null;
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

  /** Fill the menu card: a title, a line of text and a column of buttons (the last one is the main button). */
  function menuCard(title: string, text: string, actions: { label: string; run: () => void }[]) {
    $('adv-menu-title').textContent = title;
    $('adv-menu-text').textContent = text;
    const box = $('adv-menu-actions');
    box.innerHTML = '';
    actions.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${i === actions.length - 1 ? 'btn-feed' : 'btn-quiet'}`;
      b.textContent = a.label;
      b.addEventListener('click', a.run);
      box.appendChild(b);
    });
    $('adv-menu').hidden = false;
    box.querySelector<HTMLElement>('.btn-feed')?.focus();
  }
  const closeMenu = () => ($('adv-menu').hidden = true);

  /** The settings menu: restart this stage, start the whole adventure over, or go home. The run is already saved. */
  function openMenu() {
    if (busy) return; // let the attack finish first
    const here = STAGES[stage];
    const hp = here.startHp ?? TUNING.hero.hp;
    menuCard('Menu', `${here.label}: ${here.name}`, [
      {
        label: 'Restart level',
        run: () =>
          menuCard('Restart level?', `Back to the first battle of ${here.name}, with ${hp}/${TUNING.hero.hp} health. You keep your artifacts.`, [
            { label: 'Cancel', run: openMenu },
            { label: 'Restart level', run: () => (closeMenu(), startBattle(stage, 0)) },
          ]),
      },
      {
        label: 'Restart game',
        run: () =>
          menuCard('Restart the whole game?', `Start again from the Tower Road tutorial. All progress is lost${artifacts.length ? ', and so are your artifacts' : ''}.`, [
            { label: 'Cancel', run: openMenu },
            {
              label: 'Start over',
              run: () => {
                closeMenu();
                artifacts = [];
                saveArtifacts(artifacts);
                saveRun(null);
                startBattle(0, 0);
              },
            },
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
    if (!$('adv-menu').hidden) return void (e.key === 'Escape' && closeMenu());
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
      if (!resume()) startBattle(0, 0);
    },
    isOpen: () => !screen.hidden,
  };
}
