// Voice lines move Rapunzel's jaw with the sound. Each one has a jaw track made ahead of time (src/ui/jaw.ts);
// while the clip plays, the frame for its current time sets --jaw on the goat, and style.css opens the jaw that far.
import type { JawTrack } from './jaw';

/** Drive the goat's jaw from `track` whenever `audio` plays. */
export function lipSync(goatEl: HTMLElement, audio: HTMLAudioElement, track: JawTrack) {
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
  };
  audio.addEventListener('playing', () => {
    cancelAnimationFrame(frame);
    goatEl.classList.add('speaking');
    tick();
  });
  for (const type of ['pause', 'ended', 'error']) audio.addEventListener(type, stop);
}
