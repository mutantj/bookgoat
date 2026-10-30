import { freshGame, wordsFed, type GameMode, type ModeHost } from './mode';

export const BLITZ = {
  seconds: 60,
  /** Reaching a level adds this many seconds times the new level (level 2 → 20, level 3 → 30). */
  levelUpSeconds: 10,
  /** Gems come this many letters sooner than in Classic (4 letters → green, 6 → sapphire). */
  gemLengthBonus: 2,
};

const $ = (id: string) => document.getElementById(id)!;

/** As many points as possible against the clock, after a 3-2-1 countdown. Never saved. */
export function createBlitz(host: ModeHost): GameMode {
  let running = false;
  let run = 0; // bumps on every start/stop so stale countdown and clock timers do nothing
  let timer = 0;
  let end = 0;

  function renderClock(ms: number) {
    const secs = Math.ceil(Math.max(0, ms) / 1000);
    const clock = $('clock');
    clock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    clock.classList.toggle('low', ms > 0 && secs <= 10);
  }

  function stop() {
    run++;
    running = false;
    clearInterval(timer);
    $('countdown').hidden = true;
  }

  /** A fresh board with a full clock, waiting for the countdown. */
  function setup() {
    stop();
    renderClock(BLITZ.seconds * 1000);
    host.say('One minute! Feed me as many words as you can.');
    // Dim the board straight away, so it doesn't flash up before the countdown starts.
    const box = $('countdown');
    box.innerHTML = '';
    box.hidden = false;
    return freshGame(BLITZ.gemLengthBonus);
  }

  /** 3-2-1, then one minute on the clock. */
  function countIn() {
    const r = run;
    const box = $('countdown');
    const steps = ['3', '2', '1', 'Go!'];
    steps.forEach((text, i) =>
      window.setTimeout(() => {
        if (r !== run) return;
        box.hidden = false;
        box.innerHTML = `<span>${text}</span>`;
        if (i === steps.length - 1) startClock(r);
      }, i * 700),
    );
    window.setTimeout(() => r === run && (box.hidden = true), steps.length * 700);
  }

  function startClock(r: number) {
    end = performance.now() + BLITZ.seconds * 1000;
    running = true;
    timer = window.setInterval(() => {
      if (r !== run) return;
      const left = end - performance.now();
      renderClock(left);
      if (left <= 0) timeUp();
    }, 100);
  }

  function timeUp() {
    stop();
    const game = host.game;
    if (game.state.gameOver) return; // the fire got there first; its results are already on the way
    game.state.gameOver = true; // the engine refuses any more words
    host.clearSelection();
    host.say("Time's up! I'm stuffed.");
    // Let a word already in flight land before the results appear.
    window.setTimeout(() => host.showGameOver('time'), 800);
  }

  return {
    id: 'blitz',
    name: 'Blitz',
    scoresLabel: 'Blitz rounds',
    bestTitle: 'New best Blitz round!',
    help: `<b>Blitz</b> is the same game against a one-minute clock. Score as much as you can before time runs out. Reaching a level adds ${BLITZ.levelUpSeconds} seconds for each level number (level 3 adds ${3 * BLITZ.levelUpSeconds}), and gems come ${BLITZ.gemLengthBonus} letter${BLITZ.gemLengthBonus === 1 ? '' : 's'} sooner.`,

    enter: setup,
    restart: setup,
    begin: countIn,
    stop,
    canPlay: () => running,
    save() {}, // a round is over in a minute
    afterTurn(res) {
      if (!res.levelUp || !running) return '';
      const secs = host.game.state.level * BLITZ.levelUpSeconds;
      end += secs * 1000;
      return ` +${secs} seconds.`;
    },
    summary: (game, reason) => `You ${wordsFed(game)}${reason === 'fire' ? ' before the fire reached the bottom' : ' before time ran out'}.`,
  };
}
