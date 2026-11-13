// Makes the jaw track for each voice line: audio/export/<name>.wav → audio/export/<name>.jaw.json.
//   npm run lipsync
// Rerun it after re-exporting a voice line from Audacity, and add new voice lines to VOICE_LINES.
// The numbers (frames per second, gate, curve, release) are LIP_SYNC in src/ui/jaw.ts.
import fs from 'node:fs';
import { LIP_SYNC, jawFrames } from '../src/ui/jaw.ts';

const VOICE_LINES = ['welcometobookgoat', 'excellent', 'good', 'nice', 'prettygood'];

/** The samples of a 16-bit PCM WAV file (mono, or the first channel), scaled to -1..1. */
function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file} isn't a WAV file`);
  let fmt = null;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16) throw new Error(`${file}: only 16-bit PCM is supported`);
      const count = Math.floor(size / 2 / fmt.channels);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = buf.readInt16LE(body + i * 2 * fmt.channels) / 32768;
      return { samples, rate: fmt.rate };
    }
    at = body + size + (size % 2); // chunks are padded to an even length
  }
  throw new Error(`${file} has no sound data`);
}

for (const name of VOICE_LINES) {
  const { samples, rate } = readWav(`audio/export/${name}.wav`);
  const jaw = jawFrames(samples, rate);
  fs.writeFileSync(`audio/export/${name}.jaw.json`, JSON.stringify({ fps: LIP_SYNC.fps, jaw }) + '\n');
  console.log(`${name}: ${(samples.length / rate).toFixed(2)}s → ${jaw.length} jaw frames`);
}
