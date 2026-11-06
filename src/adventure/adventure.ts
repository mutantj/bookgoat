// Adventure mode: Rapunzel battles enemies above a 4×4 board. Tap tiles in any order to build a word; each
// one moves up into the word bar. Every word is an attack, and the enemy hits back after each one.
// Board rules are in rules.ts, numbers in tuning.ts, enemies in enemies.ts, the tutorial in tutorial.ts.
import './adventure.css';
import { TileFactory, type Pos, type Tile } from '../engine/board';
import { Rng } from '../engine/rng';
import { dict } from '../modes/mode';
import { Goat } from '../ui/goat';
import { ENEMIES, STAGE, type Enemy } from './enemies';
import { TUTORIAL, TUTORIAL_BOARD, TUTORIAL_DONE, TUTORIAL_REFILLS, type TutorialStep } from './tutorial';
import { SIZE, damageFor, makeBoard, num, refill, tilesFor, type Board } from './rules';
import { TUNING, gemForLength, type PowerId } from './tuning';

const POWER_UPS: { id: PowerId; icon: string; name: string; text: () => string }[] = [
  { id: 'apple', icon: '🍎', name: 'Apple', text: () => `Heals ${TUNING.powerUps.apple.heal} health.` },
  { id: 'hayBale', icon: '🌾', name: 'Hay bale', text: () => 'Blocks the next hit.' },
  { id: 'braid', icon: '✨', name: 'Golden braid', text: () => `Your next word does ×${TUNING.powerUps.braid.multiplier} damage.` },
];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const inlineSvg = (svg: string) => svg.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, '').trim();
const same = (a: Pos, b: Pos) => a.c === b.c && a.r === b.r;

export interface AdventureHost {
  /** Back to the home screen. */
  home(): void;
  tileSelected(): void;
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
  let battle = 0;
  let heroHp: number = TUNING.hero.hp;
  let startHp: number = TUNING.hero.hp; // health at the start of this battle, for a retry
  let startPowers: Record<PowerId, number> = { apple: 0, hayBale: 0, braid: 0 }; // power-ups at the start of this battle, for a retry
  let enemyHp = 0;
  let enemyTurns = 0;
  let powers: Record<PowerId, number> = { apple: 0, hayBale: 0, braid: 0 };
  let guarded = false; // hay bale up
  let braided = false; // next word doubled
  /** Index into TUTORIAL while the tutorial is running, otherwise -1. */
  let step = -1;
  let refills: string[] = [];
  const enemy = () => ENEMIES[battle];
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

  const damage = (path = selection) => damageFor(path.map(at), enemy(), braided);

  /** How hard the enemy's next hit will be. */
  function nextHit() {
    const e = enemy();
    const info = { turn: enemyTurns + 1, health: enemyHp / e.hp };
    return Math.round(e.powers.reduce((h, p) => p.hit?.(h, info) ?? h, e.hit));
  }

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
        el.dataset.kind = t.kind;
        el.setAttribute('role', 'gridcell');
        el.setAttribute('aria-label', t.kind === 'normal' ? t.letter : `${t.letter} (${t.kind} gem)`);
        el.innerHTML = tileFace(t);
        boardEl.appendChild(el);
      }
    renderSelection();
  }

  /** May the player use this right now? The tutorial allows only the step's action. */
  function allowed(action: 'word' | 'scramble' | PowerId): boolean {
    if (busy) return false;
    const s = tutorialStep();
    if (!s) return true;
    if (s.action === 'word') return action === 'word' || (action === 'scramble' && !s.word); // a way out of a stuck board
    return s.action === 'power' ? action === s.power : action === 'scramble';
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
      b.setAttribute('aria-label', i === selection.length - 1 ? `Put back ${t.letter}` : `Put back ${t.letter} and the letters after it`);
      b.innerHTML = tileFace(t);
      b.addEventListener('click', () => unpick(i));
      tray.appendChild(b);
    });
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
    const scramble = $<HTMLButtonElement>('adv-scramble');
    scramble.disabled = !allowed('scramble');
    scramble.classList.toggle('hint', s?.action === 'scramble');
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

  function renderPowers() {
    const box = $('adv-powers');
    const s = tutorialStep();
    if (!box.children.length)
      for (const p of POWER_UPS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'adv-power';
        b.dataset.id = p.id;
        b.innerHTML = `<span class="adv-power-icon" aria-hidden="true">${p.icon}</span><span class="adv-power-count"></span>`;
        b.addEventListener('click', () => usePower(p.id));
        box.appendChild(b);
      }
    for (const p of POWER_UPS) {
      const b = box.querySelector<HTMLButtonElement>(`[data-id="${p.id}"]`)!;
      const n = powers[p.id];
      const active = (p.id === 'hayBale' && guarded) || (p.id === 'braid' && braided);
      b.disabled = n === 0 || active || !allowed(p.id) || (p.id === 'apple' && heroHp >= TUNING.hero.hp);
      b.classList.toggle('active', active);
      b.classList.toggle('hint', s?.action === 'power' && s.power === p.id);
      b.title = `${p.name}: ${p.text()}`;
      b.setAttribute('aria-label', `${p.name}, ${n} left: ${p.text()}`);
      b.querySelector('.adv-power-count')!.textContent = String(n);
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

  async function usePower(id: PowerId) {
    if (!allowed(id) || powers[id] <= 0) return;
    powers[id]--;
    if (id === 'apple') {
      const heal = Math.min(TUNING.powerUps.apple.heal, TUNING.hero.hp - heroHp);
      heroHp += heal;
      pop('hero', `+${heal}`, 'heal');
      goat.react('chew');
      say('Crunchy! Much better.');
    } else if (id === 'hayBale') {
      guarded = true;
      say("I'll hide behind this hay.");
    } else {
      braided = true;
      say(`My braid is glowing! Next word does ×${TUNING.powerUps.braid.multiplier} damage.`);
    }
    renderHealth();
    const s = tutorialStep();
    if (s?.action === 'power' && s.power === id) {
      await wait(900);
      advance();
    }
    renderSelection();
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
    $('adv-hero-status').textContent = `${guarded ? '🌾' : ''}${braided ? '✨' : ''}`;
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
    braided = false;
    busyRender();

    goat.react('chew');
    $('adv-hero').classList.add('lunge');
    await wait(220);
    $('adv-hero').classList.remove('lunge');
    // In the tutorial the dummy stays up until every step is done.
    enemyHp = Math.max(step >= 0 ? 1 : 0, enemyHp - total);
    hurt('adv-enemy-wrap');
    pop('enemy', `−${total}`);
    say(`${w.toUpperCase()}! ${usedGem ? 'Gem power!' : 'Take that!'}`);

    // The used tiles are gone for good: the columns fall and new letters drop in on top.
    const created = refill(board, used, makeTile);
    const gem = gemForLength(w.length);
    if (gem && created.length) (created.find((t) => t.fresh) ?? rng.pick(created)).kind = gem;
    for (const t of created) delete t.fresh;
    if (w.length >= TUNING.braidForLength && powers.braid < TUNING.maxPowerUps) {
      powers.braid++;
      pop('hero', '+✨', 'heal');
    }
    selection = [];
    renderHealth();
    renderBoard(new Set(created.map((t) => t.id)));

    await wait(650);
    if (enemyHp <= 0) return win();
    await enemyTurn();
    if (heroHp > 0 && s?.action === 'word') advance();
  }

  /** Lock the buttons while the attack plays out, keeping the word in view. */
  function busyRender() {
    for (const id of ['adv-attack', 'adv-scramble']) $<HTMLButtonElement>(id).disabled = true;
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
    if (guarded) {
      guarded = false;
      pop('hero', 'Blocked!', 'heal');
    } else {
      heroHp = Math.max(0, heroHp - hit);
      hurt('adv-hero');
      pop('hero', `−${hit}`);
    }
    renderHealth();
    if (heroHp <= 0) return lose();
    await wait(400);
    busy = false;
    renderSelection();
  }

  async function scramble() {
    if (!allowed('scramble')) return;
    busy = true;
    selection = [];
    fillBoard();
    renderBoard(new Set(board.flat().map((t) => t.id)));
    host.boardDropped();
    say(`New letters, but the ${enemy().name} gets a free hit.`);
    await wait(500);
    await enemyTurn();
    if (tutorialStep()?.action === 'scramble') advance();
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

  function win() {
    goat.react('cheer');
    $('adv-enemy-wrap').classList.add('defeated');
    const e = enemy();
    say(e.tutorial ? 'I think I got the hang of it!' : 'Ha! Too easy.');
    const last = battle === ENEMIES.length - 1;
    // Health and power-ups carry from one troll to the next. Leaving the tutorial, she has full health and no power-ups.
    const carry = !last && !e.tutorial ? { hp: heroHp, powers: { ...powers } } : undefined;
    window.setTimeout(
      () =>
        showResult(
          last ? 'Chapter cleared!' : e.tutorial ? 'Tutorial done!' : 'Victory!',
          last
            ? `Rapunzel made it down ${STAGE}.`
            : e.tutorial
              ? 'Time for a real fight. The practice power-ups stay here, so earn your own along the way.'
              : `The ${e.name} runs off into the trees. Rapunzel goes on with ${heroHp}/${TUNING.hero.hp} health.`,
          last ? 'Play again' : 'Next battle',
          () => startBattle(last ? 0 : battle + 1, carry),
        ),
      700,
    );
  }

  function lose() {
    goat.setSad(true);
    say('Ow… I need a nap.');
    window.setTimeout(() => showResult('Rapunzel needs a rest', `The ${enemy().name} wins this time.`, 'Try again', () => startBattle(battle, { hp: startHp, powers: startPowers })), 700);
  }

  /**
   * The tutorial gives the starting power-ups to practise with. A troll battle starts with what `carry` holds, the
   * health and power-ups left after the last troll, or else full health and no power-ups. A retry passes what she had
   * when the battle first began.
   */
  function startBattle(n: number, carry?: { hp: number; powers: Record<PowerId, number> }) {
    battle = n;
    const e = enemy();
    heroHp = startHp = carry?.hp ?? TUNING.hero.hp;
    enemyHp = e.hp;
    enemyTurns = 0;
    powers = e.tutorial
      ? { apple: TUNING.powerUps.apple.start, hayBale: TUNING.powerUps.hayBale.start, braid: TUNING.powerUps.braid.start }
      : { ...(carry?.powers ?? { apple: 0, hayBale: 0, braid: 0 }) };
    startPowers = { ...powers };
    guarded = braided = false;
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
    const fights = ENEMIES.filter((x) => !x.tutorial);
    $('adv-battle').textContent = e.tutorial ? 'Tutorial' : `Battle ${fights.indexOf(e) + 1} / ${fights.length}`;
    $('adv-stage').textContent = STAGE;
    $('adv-skip').hidden = !e.tutorial;
    say(e.tutorial ? TUTORIAL[0].say : e.taunt);
    fillBoard(e.tutorial ? TUTORIAL_BOARD : undefined);
    renderHealth();
    renderBoard(new Set(board.flat().map((t) => t.id)));
    host.boardDropped();
  }

  $('adv-attack').addEventListener('click', () => void attack());
  $('adv-scramble').addEventListener('click', () => void scramble());
  $('adv-skip').addEventListener('click', () => startBattle(battle + 1));
  $('adv-home').addEventListener('click', () => {
    screen.hidden = true;
    host.home();
  });
  window.addEventListener('keydown', (e) => {
    if (screen.hidden || !$('adv-result').hidden || busy) return;
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
    /** Show the screen, starting at the tutorial. It sits under the home screen, so it can open as that fades. */
    open() {
      screen.hidden = false;
      $('adv-result').hidden = true;
      startBattle(0);
    },
    isOpen: () => !screen.hidden,
  };
}
