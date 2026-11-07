// Short sound effects through Web Audio: they start instantly, can overlap when tiles are picked quickly,
// and skip any silence at the start of the file so the sound lands on the tap.

let ctx: AudioContext | null = null;

/** Seconds of near-silence at the start of the sound. */
function leadingSilence(buf: AudioBuffer): number {
  const data = buf.getChannelData(0);
  const first = data.findIndex((v) => Math.abs(v) > 0.015);
  return first < 0 ? 0 : Math.max(0, first / buf.sampleRate - 0.005);
}

/** Load a sound now; returns a function that plays it, optionally shifted up or down by `semitones`. */
export function loadEffect(url: string): (semitones?: number) => void {
  try {
    ctx ??= new AudioContext(); // starts suspended until the first tap; resumed in play()
  } catch {
    return () => {}; // no Web Audio: play nothing
  }
  const audio = ctx;
  let buffer: AudioBuffer | null = null;
  let offset = 0;
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((data) => audio.decodeAudioData(data))
    .then((b) => {
      buffer = b;
      offset = leadingSilence(b);
    })
    .catch(() => {}); // sound is a nice-to-have; the game plays fine without it

  return (semitones = 0) => {
    if (audio.state === 'suspended') void audio.resume();
    if (!buffer) return;
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 2 ** (semitones / 12); // also plays a little faster, like a tape sped up
    src.connect(audio.destination);
    src.start(0, offset);
  };
}
