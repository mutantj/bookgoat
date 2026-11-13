// Jaw positions for a voice line, worked out ahead of time from its loudness by scripts/make-lipsync.mjs
// and saved next to the sound as <name>.jaw.json. src/ui/voice.ts plays them back in time with the clip.

/** A voice line's jaw positions: `jaw[i]` (0 closed to 100 wide open) is for the frame at i / fps seconds. */
export interface JawTrack {
  fps: number;
  jaw: number[];
}

export const LIP_SYNC = {
  /** Jaw positions per second of sound. */
  fps: 30,
  /** Frames quieter than this share of the loudest frame count as silence, so the mouth shuts between words. */
  gate: 0.08,
  /** Below 1 lifts quieter syllables, so they still move the jaw. */
  curve: 0.6,
  /** How much of the opening is kept each frame as the sound dies away (the mouth closes over a few frames, not at once). */
  release: 0.75,
};

/** Turn a clip's samples (-1 to 1) into jaw positions: loudness per frame, scaled to its loudest frame. */
export function jawFrames(samples: Float32Array | number[], sampleRate: number, opts = LIP_SYNC): number[] {
  const size = Math.max(1, Math.round(sampleRate / opts.fps));
  const loudness: number[] = [];
  for (let start = 0; start < samples.length; start += size) {
    let sum = 0;
    const end = Math.min(start + size, samples.length);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    loudness.push(Math.sqrt(sum / (end - start)));
  }
  const peak = Math.max(...loudness, 1e-9);
  const out: number[] = [];
  let jaw = 0;
  for (const l of loudness) {
    const level = l / peak < opts.gate ? 0 : (l / peak) ** opts.curve;
    jaw = Math.max(level, jaw * opts.release); // open straight away, close gradually
    out.push(Math.round(jaw * 100));
  }
  return out;
}
