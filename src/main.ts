import './style.css';
import enableText from './data/enable1.txt?raw';
import bonusText from './data/bonus.txt?raw';
import { dictionaryFromText, wordsFromText } from './engine/dictionary';
import { ClassicGame, type TurnResult } from './engine/classic';
import { isAdjacent, samePos, type Pos, type Tile } from './engine/board';
import { RULES } from './engine/rules';
import { Goat } from './ui/goat';
import { addScore, loadGame, loadScores, saveGame, type Mode } from './ui/storage';
import welcomeUrl from '../audio/export/welcometobookgoat.wav';

declare const __APP_VERSION__: string; // from package.json, see vite.config.ts

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const dict = dictionaryFromText(enableText);
const bonusWords = wordsFromText(bonusText);

let game = startGame();
let mode: Mode = 'classic';
let selection: Pos[] = [];
let busy = false; // during tile animations

const boardEl = $('board');
const chainEl = $('chain') as unknown as SVGSVGElement;
const goat = new Goat($('goat'));
const tileEls = new Map<number, HTMLDivElement>();

function startGame(): ClassicGame {
  const saved = loadGame();
  if (saved && !saved.gameOver) {
    try {
      return new ClassicGame(dict, bonusWords, saved);
    } catch {
      /* corrupt save — start fresh */
    }
  }
  return freshGame();
}

function freshGame() {
  return new ClassicGame(dict, bonusWords, (Math.random() * 2 ** 32) >>> 0);
}

/** Only Classic is saved; a Blitz round never touches the Classic save. */
function persist() {
  if (mode === 'classic') saveGame(game.state);
}

/** True while the board shouldn't take input: animating, game over, or a Blitz clock that isn't running. */
const locked = () => busy || game.state.gameOver || (mode === 'blitz' && !clockRunning);

/* ---------------- Geometry ---------------- */

let cell = 48;
function fitBoard() {
  const wide = window.innerWidth >= 900;
  const availW = wide ? 560 : boardEl.parentElement!.clientWidth;
  // On phones keep the whole game on one screen: subtract the HUD, goat and controls.
  const reserved = wide ? 200 : 330;
  const availH = Math.max(window.innerHeight - reserved, 300);
  cell = Math.floor(Math.max(36, Math.min(availW / RULES.cols, availH / (RULES.rows + 0.5), 78)));
  document.documentElement.style.setProperty('--s', `${cell}px`);
  render(true);
}

const tileXY = (p: Pos) => ({ x: p.c * cell, y: p.r * cell + (p.c % 2 ? cell / 2 : 0) });

function posAt(clientX: number, clientY: number, strict: boolean): Pos | null {
  const rect = boardEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const c = Math.floor(x / cell);
  if (c < 0 || c >= RULES.cols) return null;
  const yy = y - (c % 2 ? cell / 2 : 0);
  const r = Math.floor(yy / cell);
  if (r < 0 || r >= RULES.rows) return null;
  if (strict) {
    // While dragging, only count the inner part of a tile so diagonal moves don't clip corners.
    const dx = x - (c + 0.5) * cell;
    const dy = yy - (r + 0.5) * cell;
    if (Math.hypot(dx, dy) > cell * 0.42) return null;
  }
  return { c, r };
}

/* ---------------- Rendering ---------------- */

function makeTileEl(t: Tile): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = String(t.id);
  el.setAttribute('role', 'gridcell');
  el.innerHTML = `<div class="tile-face"><span class="tile-letter"></span><span class="tile-value"></span></div>`;
  boardEl.appendChild(el);
  tileEls.set(t.id, el);
  return el;
}

function paintTile(el: HTMLDivElement, t: Tile) {
  const letter = el.querySelector('.tile-letter')!;
  if (letter.textContent !== t.letter) letter.textContent = t.letter;
  letter.classList.toggle('qu', t.letter === 'Qu');
  const v = RULES.letterValues[t.letter] ?? 1;
  el.querySelector('.tile-value')!.textContent = v > 1 ? String(v) : '';
  el.dataset.kind = t.kind;
  el.classList.toggle('gem', t.kind !== 'normal' && t.kind !== 'burning');
  el.setAttribute('aria-label', `${t.letter}${t.kind !== 'normal' ? ` (${t.kind})` : ''}`);
}

/** Place every tile. New tiles start above their column so they fall in. */
function render(instant = false, newIds: number[] = []) {
  const fresh = new Set(newIds);
  const seen = new Set<number>();
  game.board.forEach((col, c) => {
    const incoming = col.filter((t) => fresh.has(t.id) || !tileEls.has(t.id)).length;
    col.forEach((t, r) => {
      seen.add(t.id);
      let el = tileEls.get(t.id);
      const { x, y } = tileXY({ c, r });
      if (!el) {
        el = makeTileEl(t);
        if (!instant) {
          el.classList.add('no-anim');
          el.style.transform = `translate(${x}px, ${y - incoming * cell - cell}px)`;
          void el.offsetWidth;
          el.classList.remove('no-anim');
        }
      }
      if (instant) el.classList.add('no-anim');
      paintTile(el, t);
      el.style.transform = `translate(${x}px, ${y}px)`;
      if (instant) {
        void el.offsetWidth;
        el.classList.remove('no-anim');
      }
    });
  });
  for (const [id, el] of tileEls) if (!seen.has(id) && !el.classList.contains('leaving')) (el.remove(), tileEls.delete(id));
  renderSelection();
  renderHud();
}

function renderSelection() {
  const ids = new Set(selection.map((p) => game.board[p.c][p.r].id));
  const lastId = selection.length ? game.board[selection.at(-1)!.c][selection.at(-1)!.r].id : -1;
  for (const [id, el] of tileEls) {
    el.classList.toggle('selected', ids.has(id));
    el.classList.toggle('last', id === lastId);
  }
  // Chain line through the selected tiles
  const pts = selection.map((p) => {
    const { x, y } = tileXY(p);
    return `${(x + cell / 2).toFixed(1)} ${(y + cell / 2).toFixed(1)}`;
  });
  chainEl.innerHTML = pts.length > 1 ? `<path d="M${pts.join(' L')}"/>` : '';

  const wordEl = $('current-word');
  const ptsEl = $('current-points');
  const feed = $<HTMLButtonElement>('btn-feed');
  wordEl.className = 'current-word';
  if (!selection.length) {
    wordEl.innerHTML = '&nbsp;';
    ptsEl.textContent = '';
    feed.disabled = true;
    feed.textContent = 'Feed Rapunzel';
    return;
  }
  const pv = game.preview(selection);
  wordEl.textContent = pv.word;
  wordEl.classList.add(pv.valid ? 'valid' : 'invalid');
  ptsEl.textContent = pv.valid ? `${pv.points} pts` : pv.length < RULES.minWordLength ? '' : 'not a word';
  feed.disabled = !pv.valid || busy;
  feed.textContent = pv.valid ? `Feed · ${pv.points}` : 'Feed Rapunzel';
}

function renderHud() {
  const s = game.state;
  $('score').textContent = s.score.toLocaleString();
  $('level').textContent = String(s.level);
  const target = game.levelTarget;
  $('level-progress-text').textContent = `${s.levelPoints.toLocaleString()} / ${target.toLocaleString()}`;
  const pct = Math.min(100, (s.levelPoints / target) * 100);
  $('hay-fill').style.width = `${pct}%`;
  $('hay').setAttribute('aria-valuenow', String(Math.round(pct)));
  const bw = $('bonus-word');
  bw.textContent = s.bonusWord;
  bw.classList.toggle('found', s.bonusFound);
  $('stat-longest').textContent = s.longestWord || '—';
  $('stat-best').textContent = s.bestWord ? `${s.bestWord.word} ${s.bestWord.points}` : '—';
  $('stat-words').textContent = String(s.wordsPlayed);
  $('history').innerHTML = s.history.length
    ? s.history.map((h) => `<li>${h.word}<span>${h.points}</span></li>`).join('')
    : '<li class="empty">Words you feed Rapunzel show up here.</li>';
  const danger = game.danger();
  boardEl.style.setProperty('--heat', String(Math.max(0, danger - 0.3) * 1.2));
  goat.setWorried(danger >= 0.75 && !s.gameOver);
  goat.setSad(s.gameOver);
}

/* ---------------- Speech ---------------- */

const say = (html: string) => ($('bubble').innerHTML = html);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function sayForTurn(res: TurnResult) {
  const w = `<b>${res.word.toUpperCase()}</b>`;
  if (res.gameOver) return say('The fire reached the bottom. My library is toast!');
  if (res.bonusHit) return say(`${w}! That's the bonus word. Delicious.`);
  if (res.gemEarned) return say(`${w} was so long it left a ${res.gemEarned} gem behind.`);
  if (res.spawnedBurning.length) return say(`${w}… short words make sparks. Watch that fire!`);
  if (game.danger() >= 0.75) return say(`Use the burning tile before it hits the bottom!`);
  if (res.word.length >= 5) return say(pick([`Mmm, ${w}. Chewy.`, `${w}! Now that's a meal.`, `${w} — five stars.`]));
  return say(pick([`${w}. A little snack.`, `Crunch. ${w}.`, `${w}, nom.`, `More please!`]));
}

/* ---------------- Turns ---------------- */

function animateOut(ids: number[], cls: 'eaten' | 'burnt') {
  for (const id of ids) {
    const el = tileEls.get(id);
    if (!el) continue;
    tileEls.delete(id);
    el.classList.add('leaving', cls);
    el.classList.remove('selected', 'last');
    window.setTimeout(() => el.remove(), 650);
  }
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const FEED = { lift: 100, gap: 50, maxStagger: 300, flight: 420 }; // ms
let feedGen = 0;

/** Middle of Rapunzel's mouth (or jaw) on screen, read from the SVG so it follows the artwork. */
function mouthPoint() {
  const svg = $('goat').querySelector('svg')!;
  const box = svg.getBoundingClientRect();
  const part = svg.querySelector<SVGGraphicsElement>('.mouth, .jaw');
  if (!part) return { x: box.left + box.width / 2, y: box.top + box.height * 0.7 };
  const bb = part.getBBox();
  const vb = svg.viewBox.baseVal;
  return {
    x: box.left + ((bb.x + bb.width / 2 - vb.x) * box.width) / vb.width,
    y: box.top + ((bb.y + bb.height / 2 - vb.y) * box.height) / vb.height,
  };
}

function crumbs(at: { x: number; y: number }) {
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('div');
    c.className = 'crumb';
    c.style.left = `${at.x}px`;
    c.style.top = `${at.y}px`;
    $('fly-layer').appendChild(c);
    const angle = Math.PI * (0.1 + 0.8 * Math.random()); // fan out downward
    const dist = 12 + Math.random() * 14;
    c.animate(
      [
        { transform: 'translate(-50%, -50%)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ],
      { duration: 380, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
    ).onfinish = () => c.remove();
  }
}

/** Lift the eaten tiles off the board and fly them one by one into Rapunzel's mouth, then call done. */
function feedTiles(ids: number[], done: () => void) {
  if (reduceMotion.matches) {
    animateOut(ids, 'eaten');
    return done();
  }
  const els = ids.map((id) => tileEls.get(id)).filter((el): el is HTMLDivElement => !!el);
  for (const id of ids) tileEls.delete(id);
  if (!els.length) return done();

  const gen = ++feedGen;
  const target = mouthPoint();
  const gap = els.length > 1 ? Math.min(FEED.gap, FEED.maxStagger / (els.length - 1)) : 0;
  let left = els.length;
  window.setTimeout(() => gen === feedGen && goat.openMouth(true), FEED.lift + FEED.flight - 150);

  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const fly = el.cloneNode(true) as HTMLDivElement;
    el.remove();
    fly.classList.remove('last');
    fly.classList.add('flying');
    fly.style.transform = '';
    fly.style.left = `${r.left}px`;
    fly.style.top = `${r.top}px`;
    $('fly-layer').appendChild(fly);

    // Quadratic curve from the tile to the mouth, bowing up and out so the tiles arc rather than slide.
    const lift = -cell * 0.15;
    const dx = target.x - (r.left + r.width / 2);
    const dy = target.y - (r.top + r.height / 2);
    const side = i % 2 ? 1 : -1;
    const ctrl = { x: dx / 2 + side * cell * 0.8, y: Math.min(lift, dy) - cell * 1.2 };
    const spin = side * (100 + i * 25);
    const start = FEED.lift + i * gap;
    const total = start + FEED.flight;
    const at = (x: number, y: number, s: number, rot = 0) => `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${s})`;
    const frames: Keyframe[] = [
      { offset: 0, transform: at(0, 0, 1) },
      { offset: FEED.lift / total, transform: at(0, lift, 1.12) },
      { offset: start / total, transform: at(0, lift, 1.12) },
    ];
    for (let k = 1; k <= 8; k++) {
      const t = (k / 8) ** 1.4; // speed up toward the mouth
      const x = 2 * (1 - t) * t * ctrl.x + t * t * dx;
      const y = (1 - t) ** 2 * lift + 2 * (1 - t) * t * ctrl.y + t * t * dy;
      frames.push({ offset: (start + (FEED.flight * k) / 8) / total, transform: at(x, y, 1.12 - 0.9 * t ** 0.7, spin * t) });
    }
    fly.animate(frames, { duration: total, fill: 'forwards' }).onfinish = () => {
      fly.remove();
      crumbs(target);
      if (gen === feedGen) goat.bite();
      if (--left) return;
      if (gen === feedGen) goat.openMouth(false);
      done();
    };
  });
}

function submit() {
  if (locked() || !selection.length) return;
  const eatenIds = selection.map((p) => game.board[p.c][p.r].id);
  const res = game.submit(selection);
  if (!res.ok) {
    boardEl.classList.remove('shake');
    void boardEl.offsetWidth;
    boardEl.classList.add('shake');
    if (res.reason === 'not-a-word') say(`Hmm, <b>${res.word.toUpperCase()}</b> isn't in my book.`);
    if (res.reason === 'too-short') say('Words need at least three letters.');
    return;
  }
  selection = [];
  busy = true;
  feedTiles(eatenIds, () => {
    goat.react(res.levelUp || res.bonusHit || res.gemEarned ? 'cheer' : 'chew');
    sayForTurn(res);
  });
  animateOut(res.burnedTileIds, 'burnt');
  render(false, res.newTileIds);
  persist();
  if (res.levelUp) toast(`Level ${game.state.level}! New bonus word: ${game.state.bonusWord.toUpperCase()}`);
  else if (res.bonusHit) toast(`Bonus word! +${res.bonusPoints}`);
  window.setTimeout(() => {
    busy = false;
    renderSelection();
    if (res.gameOver) showGameOver();
  }, 380);
}

function scramble() {
  if (locked()) return;
  const res = game.scramble();
  selection = [];
  animateOut(res.burnedTileIds, 'burnt');
  for (const el of tileEls.values()) {
    el.animate?.([{ transform: el.style.transform + ' rotateY(0deg)' }, { transform: el.style.transform + ' rotateY(180deg)' }, { transform: el.style.transform + ' rotateY(360deg)' }], { duration: 350 });
  }
  say('Shuffled! But scrambling started a fire somewhere up top.');
  render();
  persist();
  if (res.gameOver) window.setTimeout(showGameOver, 400);
}

function confirmScramble() {
  if (locked()) return;
  showOverlay('Scramble the board?', '<p>Every letter gets shuffled, and a fire starts somewhere up top.</p>', [
    { label: 'Cancel', run: hideOverlay },
    {
      label: 'Scramble',
      primary: true,
      run: () => {
        hideOverlay();
        scramble();
      },
    },
  ]);
}

function clearSelection() {
  selection = [];
  renderSelection();
}

/** Swap in a different game and redraw the board from scratch. */
function loadBoard(g: ClassicGame) {
  for (const el of tileEls.values()) el.remove();
  tileEls.clear();
  game = g;
  selection = [];
  hideOverlay();
  render();
}

function setMode(m: Mode) {
  stopBlitz();
  mode = m;
  $('app').dataset.mode = m;
  $('mode-chip').textContent = m === 'blitz' ? 'Blitz' : 'Classic';
}

/** Back to Classic, resuming the saved game if there is one. */
function startClassic() {
  setMode('classic');
  loadBoard(startGame());
  say(game.state.wordsPlayed > 0 ? `Welcome back! You're on level ${game.state.level}.` : "Spell a word and I'll eat it.");
}

function newGame() {
  if (mode === 'blitz') return startBlitz();
  saveGame(null);
  loadBoard(freshGame());
  say("Fresh shelf of letters. Spell a word and I'll eat it.");
  persist();
}

/* ---------------- Blitz ---------------- */

const BLITZ_MS = 60_000;
let clockRunning = false;
let blitzRun = 0; // bumps on every start/stop so stale countdown and clock timers do nothing
let clockTimer = 0;

function renderClock(ms: number) {
  const secs = Math.ceil(Math.max(0, ms) / 1000);
  const clock = $('clock');
  clock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  clock.classList.toggle('low', ms > 0 && secs <= 10);
}

function stopBlitz() {
  blitzRun++;
  clockRunning = false;
  clearInterval(clockTimer);
  $('countdown').hidden = true;
}

/** A fresh board with a full clock, waiting for the countdown. */
function setupBlitz() {
  setMode('blitz');
  loadBoard(freshGame());
  renderClock(BLITZ_MS);
  say('One minute! Feed me as many words as you can.');
}

function startBlitz() {
  setupBlitz();
  countIn();
}

/** 3-2-1, then one minute on the clock. */
function countIn() {
  const run = blitzRun;
  const box = $('countdown');
  const steps = ['3', '2', '1', 'Go!'];
  steps.forEach((text, i) =>
    window.setTimeout(() => {
      if (run !== blitzRun) return;
      box.hidden = false;
      box.innerHTML = `<span>${text}</span>`;
      if (i === steps.length - 1) runClock(run);
    }, i * 700),
  );
  window.setTimeout(() => run === blitzRun && (box.hidden = true), steps.length * 700);
}

function runClock(run: number) {
  const end = performance.now() + BLITZ_MS;
  clockRunning = true;
  clockTimer = window.setInterval(() => {
    if (run !== blitzRun) return;
    const left = end - performance.now();
    renderClock(left);
    if (left <= 0) timeUp();
  }, 100);
}

function timeUp() {
  stopBlitz();
  if (game.state.gameOver) return; // the fire got there first; its results are already on the way
  game.state.gameOver = true; // the engine refuses any more words
  selection = [];
  renderSelection();
  say("Time's up! I'm stuffed.");
  // Let a word already in flight land before the results appear.
  window.setTimeout(() => showGameOver('time'), 800);
}

/* ---------------- Input: taps & drags ---------------- */

let downPos: Pos | null = null;
let dragging = false;
let pointerId: number | null = null;

function tap(p: Pos) {
  const idx = selection.findIndex((q) => samePos(q, p));
  const last = selection.at(-1);
  if (!last) selection = [p];
  else if (samePos(last, p)) {
    if (game.preview(selection).valid) return submit();
    selection.pop();
  } else if (idx >= 0) selection = selection.slice(0, idx + 1);
  else if (isAdjacent(last, p)) selection.push(p);
  else selection = [p];
  renderSelection();
}

function dragInto(p: Pos) {
  const last = selection.at(-1)!;
  if (samePos(last, p)) return;
  const prev = selection.at(-2);
  if (prev && samePos(prev, p)) selection.pop(); // backtrack
  else if (!selection.some((q) => samePos(q, p)) && isAdjacent(last, p)) selection.push(p);
  renderSelection();
}

boardEl.addEventListener('pointerdown', (e) => {
  if (locked()) return;
  const p = posAt(e.clientX, e.clientY, false);
  if (!p) return;
  downPos = p;
  dragging = false;
  pointerId = e.pointerId;
  boardEl.setPointerCapture(e.pointerId);
});
boardEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId || !downPos) return;
  const p = posAt(e.clientX, e.clientY, true);
  if (!p || samePos(p, downPos) && !dragging) return;
  if (!dragging) {
    dragging = true;
    const last = selection.at(-1);
    if (!last || !samePos(last, downPos)) selection = [downPos];
  }
  dragInto(p);
});
const endPointer = (e: PointerEvent) => {
  if (e.pointerId !== pointerId) return;
  if (downPos && !dragging) tap(downPos);
  downPos = null;
  dragging = false;
  pointerId = null;
};
boardEl.addEventListener('pointerup', endPointer);
boardEl.addEventListener('pointercancel', (e) => {
  downPos = null;
  dragging = false;
  if (e.pointerId === pointerId) pointerId = null;
});

/* ---------------- Input: keyboard shortcuts (no typing words) ---------------- */

window.addEventListener('keydown', (e) => {
  if (!$('overlay').hidden) {
    if (e.key === 'Escape') hideOverlay();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || locked() || !$('splash').hidden) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    submit();
  } else if (e.key === 'Escape') clearSelection();
  else if (e.key === 'Backspace') {
    e.preventDefault();
    selection.pop();
    renderSelection();
  }
});

/* ---------------- Overlays ---------------- */

function showOverlay(title: string, body: string, actions: { label: string; primary?: boolean; run: () => void }[]) {
  $('overlay-title').textContent = title;
  $('overlay-body').innerHTML = body;
  const box = $('overlay-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${a.primary ? 'btn-feed' : 'btn-quiet'}`;
    b.textContent = a.label;
    b.addEventListener('click', a.run);
    box.appendChild(b);
  }
  $('overlay').hidden = false;
  (box.querySelector('.btn-feed') as HTMLElement | null)?.focus();
}
function hideOverlay() {
  $('overlay').hidden = true;
}

function scoresHtml(m: Mode, highlight = -1) {
  const scores = loadScores(m);
  if (!scores.length) return '';
  return `<p class="label" style="color:#5b6b68">Best ${m === 'blitz' ? 'Blitz rounds' : 'games'} on this device</p><ol class="scores">${scores
    .map((s, i) => `<li${i === highlight ? ' style="font-weight:700"' : ''}>${s.score.toLocaleString()} · level ${s.level}${s.best ? ` · ${s.best.toUpperCase()}` : ''}</li>`)
    .join('')}</ol>`;
}

function showGameOver(reason: 'fire' | 'time' = 'fire') {
  const s = game.state;
  const blitz = mode === 'blitz';
  stopBlitz();
  const rank = addScore(mode, { score: s.score, level: s.level, best: s.bestWord?.word ?? '', date: new Date().toISOString() });
  if (!blitz) saveGame(null);
  const title =
    rank === 0 ? (blitz ? 'New best Blitz round!' : 'New best game!') : reason === 'time' ? "Time's up!" : 'The library burned down';
  const fed = `fed Rapunzel ${s.wordsPlayed} word${s.wordsPlayed === 1 ? '' : 's'}`;
  showOverlay(
    title,
    `<div class="final-score">${s.score.toLocaleString()}</div>
     <p>${blitz ? `You ${fed}${reason === 'fire' ? ' before the fire reached the bottom' : ' in one minute'}` : `You reached level ${s.level} and ${fed}`}.${
       s.bestWord ? ` Best word: <b>${s.bestWord.word.toUpperCase()}</b> for ${s.bestWord.points}.` : ''
     }</p>${scoresHtml(mode, rank)}`,
    [
      { label: 'Home', run: showHome },
      { label: 'Play again', primary: true, run: newGame },
    ],
  );
}

function showHelp() {
  const gem = (k: string) => `<span class="gem-key" style="background:var(--gem-${k})"></span>`;
  showOverlay(
    'How to play',
    `<ul>
      <li>Drag across touching letters, or tap them one by one, to spell a word of 3+ letters.</li>
      <li>Tap the last letter again, or press <b>Feed</b> to feed the word to Rapunzel.</li>
      <li>Longer words and rare letters score more. <b>Qu</b> counts as two letters.</li>
      <li>Long words leave gems that multiply your next word: ${gem('green')}6 ${gem('gold')}7 ${gem('sapphire')}8 ${gem('diamond')}9 ${gem('crystal')}10+ letters.</li>
      <li><b style="color:#c4320f">Burning tiles</b> burn the tile below each turn. Use them in a word to put them out. If one reaches the bottom, the game ends.</li>
      <li>Short words can start new fires, and so can <b>Scramble</b>.</li>
      <li>Spell the bonus word for extra points. Fill the hay bar to reach the next level.</li>
      <li><b>Blitz</b> is the same game against a one-minute clock. Score as much as you can before time runs out.</li>
    </ul>${scoresHtml(mode)}`,
    [{ label: 'Got it', primary: true, run: hideOverlay }],
  );
}

function confirmNewGame(then?: () => void) {
  const start = () => {
    newGame();
    then?.();
  };
  if (game.state.wordsPlayed === 0) return start();
  showOverlay('Start a new game?', '<p>Your current game will be lost.</p>', [
    { label: 'Keep playing', run: hideOverlay },
    { label: 'New game', primary: true, run: start },
  ]);
}

let toastTimer = 0;
function toast(text: string) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2400);
}

/* ---------------- Wire up ---------------- */

$('btn-feed').addEventListener('click', submit);
$('btn-clear').addEventListener('click', clearSelection);
$('btn-scramble').addEventListener('click', confirmScramble);
$('btn-new').addEventListener('click', () => confirmNewGame());
$('btn-home').addEventListener('click', showHome);
$('btn-help').addEventListener('click', showHelp);
$('overlay').addEventListener('click', (e) => e.target === $('overlay') && !game.state.gameOver && hideOverlay());
window.addEventListener('resize', () => fitBoard());
// iOS Safari ignores user-scalable=no, so block pinch zoom directly.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });

/* ---------------- Loading screen ---------------- */

new Goat($('splash-goat'));
const welcome = new Audio(welcomeUrl);
let welcomeDone = false;
let afterWelcome: (() => void) | null = null;
function finishWelcome() {
  welcomeDone = true;
  $('splash-goat').classList.remove('talk');
  afterWelcome?.();
}
welcome.addEventListener('playing', () => $('splash-goat').classList.add('talk'));
welcome.addEventListener('ended', finishWelcome);
welcome.addEventListener('error', finishWelcome);

// Greet as soon as the splash is ready. Most browsers block sound until the first tap or key
// on a page, so if this is refused, greet on that first tap or key instead.
function playWelcome() {
  welcome.play().catch(() => {
    const retry = () => {
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
      welcome.play().catch(finishWelcome);
    };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
  });
}

const homeButtons = () => [$<HTMLButtonElement>('btn-start'), $<HTMLButtonElement>('btn-blitz')];

// Let Rapunzel finish her greeting before showing the board, then run `then` once the home screen has gone.
function startFromSplash(then?: () => void) {
  const splash = $('splash');
  for (const b of homeButtons()) b.disabled = true;
  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    splash.classList.add('leaving');
    window.setTimeout(() => {
      splash.hidden = true;
      then?.();
    }, 400);
  };
  if (welcomeDone) return leave();
  afterWelcome = leave;
  window.setTimeout(leave, 4000); // never get stuck if the audio stalls
}

/** Refresh the home screen's buttons from the Classic save. */
function setupHome() {
  const saved = loadGame();
  const inProgress = !!saved && saved.wordsPlayed > 0 && !saved.gameOver;
  $('btn-start').textContent = inProgress ? 'Continue' : 'Play Classic';
  $('splash-saved').textContent = inProgress ? `Classic game in progress: level ${saved.level}, ${saved.score.toLocaleString()} points` : '';
  $('splash-saved').hidden = !inProgress;
  for (const b of homeButtons()) b.disabled = false;
}

function showHome() {
  stopBlitz();
  hideOverlay();
  setupHome();
  const splash = $('splash');
  splash.classList.remove('leaving');
  splash.hidden = false;
  $('btn-start').focus();
}

$('btn-start').addEventListener('click', () => {
  startClassic();
  startFromSplash();
});
$('btn-blitz').addEventListener('click', () => {
  setupBlitz(); // swap in the Blitz board now so the old one never shows as the home screen fades
  startFromSplash(countIn);
});

$('splash-version').textContent = `v${__APP_VERSION__}`;
setupHome();
$('btn-start').focus();
playWelcome();

fitBoard();
