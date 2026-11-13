// Voice lines move Rapunzel's jaw with the sound. Each one has a jaw track made ahead of time (src/ui/jaw.ts);
// while the clip plays, the frame for its current time sets --jaw on the goat, and style.css opens the jaw that far.
import type { JawTrack } from './jaw';

/** Move `goatEl`'s jaw along `track` while `audio` plays, until it ends, pauses or fails. */
function driveJaw(goatEl: HTMLElement, audio: HTMLAudioElement, track: JawTrack) {
  let frame = 0;
  const tick = () => {
    const open = (track.jaw[Math.floor(audio.currentTime * track.fps)] ?? 0) / 100;
    goatEl.style.setProperty('--jaw', open.toFixed(2));
    frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    goatEl.classList.remove('speaking');
    goatEl.style.setProperty('--jaw', '0');
    for (const type of ['pause', 'ended', 'error']) audio.removeEventListener(type, stop);
  };
  for (const type of ['pause', 'ended', 'error']) audio.addEventListener(type, stop);
  goatEl.classList.add('speaking');
  tick();
}

/** Drive the goat's jaw from `track` whenever `audio` plays (used for the home-screen greeting). */
export function lipSync(goatEl: HTMLElement, audio: HTMLAudioElement, track: JawTrack) {
  audio.addEventListener('playing', () => driveJaw(goatEl, audio, track));
}

let current: HTMLAudioElement | null = null;

/** Is a line started by speak() still playing? */
export const isSpeaking = () => !!current && !current.paused && !current.ended;

/** Rapunzel says a line from the start, with `goatEl`'s jaw following it. */
export function speak(goatEl: HTMLElement, audio: HTMLAudioElement, track: JawTrack) {
  current = audio;
  audio.currentTime = 0;
  audio.addEventListener('playing', () => driveJaw(goatEl, audio, track), { once: true });
  audio.play().catch(() => {}); // a voice line is a nice-to-have; never block the game on it
}
