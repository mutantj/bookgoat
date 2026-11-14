// Evens out the volume of every sound in audio/export/: each one is turned up or down to the same loudness
// (TARGET_LUFS). A limiter keeps its loudest moments under CEILING_DB, trimming at most MAX_LIMIT_DB off any
// peak; a sound that would need more than that stops short of the target instead.
//   npm run normalize-audio     (needs ffmpeg)
// Rerun it after exporting a new or changed sound from Audacity. Finished files are remembered by a fingerprint in
// audio/export/normalized.json, so a rerun only touches new or re-exported sounds.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

/** How loud every sound should be (LUFS, a measure of how loud it sounds to people). */
const TARGET_LUFS = -18;
/** The loudest any sample may get (dBFS), leaving a little headroom so nothing clips. */
const CEILING_DB = -1;
/** The most the limiter may squash a sound's peaks, so sharp sounds like the tile click keep their snap. */
const MAX_LIMIT_DB = 6;

/** Sounds played at the volume they were exported at, left out of the evening-out. */
const KEEP_AS_EXPORTED = ['tileselect.wav'];

const DIR = 'audio/export';
const DONE_FILE = `${DIR}/normalized.json`;

/** Integrated loudness and true peak, from ffmpeg's EBU R128 meter (which it prints on stderr). */
function measure(file) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const out = log.slice(log.lastIndexOf('Summary:')); // the totals, not the moment-by-moment readings above them
  return { lufs: Number(out.match(/I:\s+(-?[\d.]+) LUFS/)[1]), peak: Number(out.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]) };
}

const fingerprint = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);

/** Write `src` turned up by `gain` dB, through the limiter, to `dest`. */
function render(src, gain, dest) {
  const filter = `volume=${gain.toFixed(2)}dB,alimiter=limit=${10 ** (CEILING_DB / 20)}:level=false:latency=true`;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af', filter, '-c:a', 'pcm_s16le', '-map_metadata', '-1', dest]);
}

const done = fs.existsSync(DONE_FILE) ? JSON.parse(fs.readFileSync(DONE_FILE, 'utf8')) : {};
for (const name of fs.readdirSync(DIR).filter((f) => f.endsWith('.wav')).sort()) {
  const file = `${DIR}/${name}`;
  if (KEEP_AS_EXPORTED.includes(name)) {
    delete done[name];
    console.log(`${name.padEnd(26)} kept as exported`);
    continue;
  }
  if (done[name] === fingerprint(file)) {
    console.log(`${name.padEnd(26)} already done`);
    continue;
  }
  const before = measure(file);
  const most = CEILING_DB - before.peak + MAX_LIMIT_DB; // the limiter can't trim more than this
  const tmp = `${file}.tmp.wav`;
  // The limiter takes a little loudness off, so nudge the gain up a couple of times to land on the target.
  let gain = Math.min(TARGET_LUFS - before.lufs, most);
  let after = before;
  for (let pass = 0; pass < 3; pass++) {
    render(file, gain, tmp);
    after = measure(tmp);
    const short = TARGET_LUFS - after.lufs;
    if (Math.abs(short) < 0.3 || gain >= most) break;
    gain = Math.min(gain + short, most);
  }
  fs.renameSync(tmp, file);
  done[name] = fingerprint(file);
  console.log(`${name.padEnd(26)} ${before.lufs.toFixed(1)} → ${after.lufs.toFixed(1)} LUFS, peak ${before.peak.toFixed(1)} → ${after.peak.toFixed(1)} dB (${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB)`);
}
fs.writeFileSync(DONE_FILE, JSON.stringify(done, null, 2) + '\n');
