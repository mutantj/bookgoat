// Builds the app icons from Rapunzel's drawing (art/rapunzel.svg): her face on the game's night-teal ground.
//   node scripts/make-icons.mjs   → public/icon.svg (browser tab) and public/icon-maskable.svg (Android, extra padding)
// Then render the PNGs that phones need from those, e.g. with headless Chrome:
//   chrome --headless=new --screenshot=public/apple-touch-icon.png --window-size=180,180 public/icon.svg
//   (likewise icon-192.png at 192, icon-512.png at 512, and icon-maskable-512.png from icon-maskable.svg at 512)
import fs from 'node:fs';

const goat = fs
  .readFileSync('art/rapunzel.svg', 'utf8')
  .match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1]
  // Parts that are normally hidden until an animation shows them: closed eyelids, the open mouth, the sweat drop.
  .replace(/<ellipse class="lid"[^>]*\/>/g, '')
  .replace(/<g class="mouth">[\s\S]*?<\/g>/, '')
  .replace(/<path class="sweat"[^>]*\/>/, '');

// Her drawing is centred near (60, 57) in a 124×116 box. `scale` sets how much of the square she fills.
const icon = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><radialGradient id="ground" cx="50%" cy="20%" r="90%"><stop offset="0" stop-color="#2b5a60"/><stop offset="1" stop-color="#173236"/></radialGradient></defs>
  <rect width="128" height="128" fill="url(#ground)"/>
  <g transform="translate(${64 - 60 * scale} ${64 - 57 * scale}) scale(${scale})">${goat}</g>
</svg>
`;

fs.writeFileSync('public/icon.svg', icon(1.12));
fs.writeFileSync('public/icon-maskable.svg', icon(0.84)); // Android may crop to a circle; keep her inside the middle 80%
console.log('wrote public/icon.svg and public/icon-maskable.svg');
