// Adventure mode, UI first: Rapunzel battles an enemy above a 4×4 board. Every word is an attack.
// The numbers (health, damage, enemy hits) are placeholders to make the screen feel alive, not a design.
import './adventure.css';
import trollSvg from '../../art/troll.svg?raw';
import { TileFactory, type Pos, type Tile } from '../engine/board';
import { RULES } from '../engine/rules';
import { Rng } from '../engine/rng';
import { dict } from '../modes/mode';
import { Goat } from '../ui/goat';

const SIZE = 4;
const MIN_WORD = 3;
const HERO_HP = 30;

interface Enemy {
  name: string;
  hp: number;
  hit: number;
  /** Tints the placeholder troll. */
  hue: number;
  taunt: string;
  /** Shown beside the board. Not working yet: only the hit is. */
  powers: { name: string; text: string }[];
}

/** Placeholder power-ups, shown to the left of the board. Not working yet. */
const POWER_UPS = [
  { icon: '🍎', name: 'Apple', text: 'Heals 8 health.', count: 2 },
  { icon: '🌾', name: 'Hay bale', text: 'Blocks the next hit.', count: 1 },
  { icon: '✨', name: 'Golden braid', text: 'Doubles the damage of your next word.', count: 0 },
];

const STAGE = 'The Tower Road';
const ENEMIES: Enemy[] = [
  {
    name: 'Moss Troll',
    hp: 20,
    hit: 3,
    hue: 0,
    taunt: 'Nobody crosses my bridge!',
    powers: [{ name: 'Thick moss', text: '3-letter words do 1 less damage.' }],
  },
  {
    name: 'Frost Troll',
    hp: 28,
    hit: 4,
    hue: 150,
    taunt: 'Brr. Your words feel cold already.',
    powers: [
      { name: 'Freeze', text: 'Every 3 turns, freezes a tile so it can\'t be used.' },
      { name: 'Icy hide', text: 'Takes no damage from the letter S.' },
    ],
  },
  {
    name: 'Ember Troll',
    hp: 36,
    hit: 5,
    hue: 280,
    taunt: 'I eat goats for breakfast.',
    powers: [
      { name: 'Kindle', text: 'Sets a tile on fire each turn. Burning tiles hurt Rapunzel if left alone.' },
      { name: 'Hot temper', text: 'Hits twice when below half health.' },
    ],
  },
];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

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
  $('adv-enemy').innerHTML = trollSvg.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, '').trim();

  const factory = new TileFactory(new Rng((Math.random() * 2 ** 32) >>> 0));
  let board: Tile[][] = []; // board[c][r], like the main game
  let selection: Pos[] = [];
  let busy = false;
  let battle = 0;
  let heroHp = HERO_HP;
  let enemyHp = 0;
  const enemy = () => ENEMIES[battle];

  /* ---------- Board ---------- */

  function fillBoard() {
    board = [];
    for (let c = 0; c < SIZE; c++) {
      board.push([]);
      for (let r = 0; r < SIZE; r++) board[c].push(factory.make(board));
    }
  }

  const at = (p: Pos) => board[p.c][p.r];
  const word = () => selection.map((p) => at(p).letter.toLowerCase()).join('');
  const damage = () => Math.round(selection.reduce((sum, p) => sum + (RULES.letterValues[at(p).letter] ?? 1), 0));
  const isWord = () => word().length >= MIN_WORD && dict.has(word());
  const touches = (a: Pos, b: Pos) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r)) === 1;

  /** Draw the board; tiles listed in `fresh` drop in. */
  function renderBoard(fresh = new Set<number>()) {
    boardEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const t = board[c][r];
        const el = document.createElement('div');
        el.className = 'tile adv-tile';
        if (fresh.has(t.id)) el.classList.add('drop');
        el.dataset.c = String(c);
        el.dataset.r = String(r);
        el.setAttribute('role', 'gridcell');
        el.setAttribute('aria-label', t.letter);
        const v = RULES.letterValues[t.letter] ?? 1;
        el.innerHTML = `<div class="tile-face"><span class="tile-letter${t.letter === 'Qu' ? ' qu' : ''}">${t.letter}</span><span class="tile-value">${v > 1 ? v : ''}</span></div>`;
        boardEl.appendChild(el);
      }
    renderSelection();
  }

  function renderSelection() {
    const last = selection.at(-1);
    for (const el of boardEl.querySelectorAll<HTMLElement>('.adv-tile')) {
      const p = { c: Number(el.dataset.c), r: Number(el.dataset.r) };
      const on = selection.some((s) => s.c === p.c && s.r === p.r);
      el.classList.toggle('selected', on);
      el.classList.toggle('last', on && !!last && last.c === p.c && last.r === p.r);
    }
    const w = word();
    const wordEl = $('adv-word');
    wordEl.textContent = w ? w.toUpperCase() : ' ';
    wordEl.className = `current-word ${!w ? '' : isWord() ? 'valid' : 'invalid'}`;
    $('adv-damage').textContent = isWord() ? `⚔ ${damage()} damage` : w.length && w.length < MIN_WORD ? `${MIN_WORD}+ letters` : '';
    $<HTMLButtonElement>('adv-attack').disabled = busy || !isWord();
  }

  /** Tap or drag onto a tile: extend the chain, or back up to it if it's already in the chain. */
  function pick(p: Pos) {
    const i = selection.findIndex((s) => s.c === p.c && s.r === p.r);
    if (i >= 0) selection = selection.slice(0, i + 1 === selection.length ? i : i + 1);
    else if (!selection.length || touches(selection.at(-1)!, p)) selection.push(p);
    else selection = [p];
    if (i < 0) host.tileSelected();
    renderSelection();
  }

  const posAt = (x: number, y: number): Pos | null => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.adv-tile');
    return el ? { c: Number(el.dataset.c), r: Number(el.dataset.r) } : null;
  };

  let dragging = false;
  boardEl.addEventListener('pointerdown', (e) => {
    if (busy) return;
    const p = posAt(e.clientX, e.clientY);
    if (!p) return;
    dragging = true;
    pick(p);
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!dragging || busy) return;
    const p = posAt(e.clientX, e.clientY);
    const last = selection.at(-1);
    if (!p || (last && last.c === p.c && last.r === p.r)) return;
    const prev = selection.at(-2);
    if (prev && prev.c === p.c && prev.r === p.r) pick(last!); // dragged back: drop the last tile
    else if (!selection.some((s) => s.c === p.c && s.r === p.r) && last && touches(last, p)) pick(p);
  });
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointercancel', () => (dragging = false));

  /* ---------- Beside the board ---------- */

  function renderPowers() {
    const box = $('adv-powers');
    box.innerHTML = '';
    for (const p of POWER_UPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'adv-power';
      b.disabled = p.count === 0;
      b.title = `${p.name}: ${p.text}`;
      b.setAttribute('aria-label', `${p.name}, ${p.count} left: ${p.text}`);
      b.innerHTML = `<span class="adv-power-icon" aria-hidden="true">${p.icon}</span><span class="adv-power-count">${p.count}</span>`;
      b.addEventListener('click', () => say(`${p.name}: ${p.text} (Power-ups don't work yet.)`));
      box.appendChild(b);
    }
  }

  function renderInfo(e: Enemy) {
    $('adv-info').innerHTML =
      `<h3 class="adv-info-name">${e.name}</h3>` +
      `<p class="adv-info-hit">⚔ Hits for ${e.hit} each turn</p>` +
      `<span class="label">Powers</span>` +
      `<ul class="adv-info-powers">${e.powers.map((p) => `<li><b>${p.name}</b> ${p.text}</li>`).join('')}</ul>`;
  }

  /* ---------- Battle ---------- */

  function say(text: string) {
    $('adv-bubble').textContent = text;
  }

  function renderHealth() {
    const e = enemy();
    $('adv-hero-hp').style.width = `${(heroHp / HERO_HP) * 100}%`;
    $('adv-hero-hp-text').textContent = `${heroHp}/${HERO_HP}`;
    $('adv-enemy-hp').style.width = `${(enemyHp / e.hp) * 100}%`;
    $('adv-enemy-hp-text').textContent = `${enemyHp}/${e.hp}`;
    $('adv-hero-bar').classList.toggle('low', heroHp <= HERO_HP * 0.3);
    goat.setWorried(heroHp > 0 && heroHp <= HERO_HP * 0.3);
  }

  /** A number that floats up from a fighter. */
  function pop(fighter: 'hero' | 'enemy', text: string) {
    const el = document.createElement('span');
    el.className = 'adv-pop';
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

  async function attack() {
    if (busy || !isWord()) return;
    busy = true;
    const dmg = damage();
    const used = selection;
    const w = word();
    selection = [];
    renderSelection();

    goat.react('chew');
    $('adv-hero').classList.add('lunge');
    await wait(220);
    $('adv-hero').classList.remove('lunge');
    enemyHp = Math.max(0, enemyHp - dmg);
    hurt('adv-enemy-wrap');
    pop('enemy', `−${dmg}`);
    renderHealth();
    say(`${w.toUpperCase()}! Take that!`);

    // The used letters leave, the columns fall, and new letters drop in on top.
    const fresh = new Set<number>();
    for (let c = 0; c < SIZE; c++) {
      const gone = new Set(used.filter((p) => p.c === c).map((p) => p.r));
      if (!gone.size) continue;
      const added = [...gone].map(() => factory.make(board));
      added.forEach((t) => fresh.add(t.id));
      board[c] = [...added, ...board[c].filter((_, r) => !gone.has(r))];
    }
    renderBoard(fresh);

    await wait(650);
    if (enemyHp <= 0) return win();
    await enemyTurn();
  }

  async function enemyTurn() {
    busy = true;
    renderSelection();
    const e = enemy();
    $('adv-enemy-wrap').classList.add('lunge');
    await wait(220);
    $('adv-enemy-wrap').classList.remove('lunge');
    heroHp = Math.max(0, heroHp - e.hit);
    hurt('adv-hero');
    pop('hero', `−${e.hit}`);
    renderHealth();
    if (heroHp <= 0) return lose();
    await wait(400);
    busy = false;
    renderSelection();
  }

  async function scramble() {
    if (busy) return;
    busy = true;
    selection = [];
    fillBoard();
    renderBoard(new Set(board.flat().map((t) => t.id)));
    host.boardDropped();
    say('New letters, but the troll gets a free swing.');
    await wait(500);
    await enemyTurn();
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
    say('Ha! Too easy.');
    const last = battle === ENEMIES.length - 1;
    window.setTimeout(
      () =>
        showResult(
          last ? 'Chapter cleared!' : 'Victory!',
          last ? `Rapunzel made it down ${STAGE}.` : `The ${enemy().name} runs off into the trees.`,
          last ? 'Play again' : 'Next battle',
          () => startBattle(last ? 0 : battle + 1, last),
        ),
      700,
    );
  }

  function lose() {
    goat.setSad(true);
    say('Ow… I need a nap.');
    window.setTimeout(() => showResult('Rapunzel needs a rest', `The ${enemy().name} wins this time.`, 'Try again', () => startBattle(battle, true)), 700);
  }

  function startBattle(n: number, freshHero: boolean) {
    battle = n;
    const e = enemy();
    if (freshHero) heroHp = HERO_HP;
    enemyHp = e.hp;
    busy = false;
    selection = [];
    goat.setSad(false);
    $('adv-enemy-wrap').classList.remove('defeated', 'hurt');
    $('adv-enemy-wrap').style.setProperty('--hue', `${e.hue}deg`);
    $('adv-enemy-name').textContent = e.name;
    renderInfo(e);
    $('adv-battle').textContent = `Battle ${n + 1} / ${ENEMIES.length}`;
    $('adv-stage').textContent = STAGE;
    say(e.taunt);
    renderHealth();
    fillBoard();
    renderBoard(new Set(board.flat().map((t) => t.id)));
    host.boardDropped();
  }

  $('adv-attack').addEventListener('click', () => void attack());
  $('adv-scramble').addEventListener('click', () => void scramble());
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
    }
  });

  return {
    /** Show the screen with a fresh chapter. Call once the home screen has gone. */
    open() {
      screen.hidden = false;
      renderPowers();
      $('adv-result').hidden = true;
      startBattle(0, true);
    },
    isOpen: () => !screen.hidden,
  };
}
