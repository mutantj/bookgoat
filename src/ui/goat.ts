// Rapunzel: an original goat with a long golden braid. Pure inline SVG so it ships with the page.

function braid(): string {
  const p0 = [74, 36], p1 = [112, 58], p2 = [94, 106];
  let out = '';
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    const rot = i % 2 ? 35 : -35;
    const r = 6.2 - t * 1.8;
    out += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.62).toFixed(1)}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#f2c64e" stroke="#b9852a" stroke-width="1"/>`;
  }
  // Ribbon at the end of the braid
  out += `<path d="M94 106 l-9 -5 l1 10 z M94 106 l9 -5 l-1 10 z" fill="#ff7aa8" stroke="#c94c7c" stroke-width="1"/><circle cx="94" cy="106" r="2.6" fill="#ff7aa8" stroke="#c94c7c"/>`;
  return out;
}

export const GOAT_SVG = `
<svg viewBox="0 0 124 116" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rapunzel the goat">
  <g stroke-linejoin="round">
    <path d="M50 35 C 40 10, 20 6, 12 20 C 22 15, 35 20, 44 39 Z" fill="#dccdb0" stroke="#9c8b6d" stroke-width="1.5"/>
    <path d="M70 35 C 80 10, 100 6, 108 20 C 98 15, 85 20, 76 39 Z" fill="#dccdb0" stroke="#9c8b6d" stroke-width="1.5"/>
    <path d="M30 22 l5 4 M24 18 l4 5 M90 22 l-5 4 M96 18 l-4 5" stroke="#9c8b6d" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <g class="ear-l"><ellipse cx="32" cy="50" rx="15" ry="6.5" transform="rotate(-22 32 50)" fill="#efe7da" stroke="#b9ad98" stroke-width="1.5"/>
      <ellipse cx="31" cy="50" rx="9" ry="3" transform="rotate(-22 31 50)" fill="#f3b6c3"/></g>
    <g><ellipse cx="88" cy="50" rx="15" ry="6.5" transform="rotate(22 88 50)" fill="#efe7da" stroke="#b9ad98" stroke-width="1.5"/>
      <ellipse cx="89" cy="50" rx="9" ry="3" transform="rotate(22 89 50)" fill="#f3b6c3"/></g>
    <path d="M60 29 C 83 29, 87 51, 81 70 C 77 84, 70 92, 60 92 C 50 92, 43 84, 39 70 C 33 51, 37 29, 60 29 Z" fill="#f6f1e8" stroke="#b9ad98" stroke-width="1.5"/>
    <path d="M44 38 C 50 24, 72 22, 78 37 C 72 32, 64 34, 58 31 C 54 35, 49 35, 44 38 Z" fill="#f2c64e" stroke="#b9852a" stroke-width="1"/>
    <circle cx="45" cy="70" r="5" fill="#f7c1c9" opacity="0.7"/>
    <circle cx="75" cy="70" r="5" fill="#f7c1c9" opacity="0.7"/>
    <g>
      <ellipse cx="50" cy="56" rx="7.5" ry="6.2" fill="#fffdf6" stroke="#8c7f6a" stroke-width="1.2"/>
      <rect class="pupil" x="46.5" y="53.8" width="7" height="4.4" rx="2" fill="#2a2622"/><circle cx="51.5" cy="54.6" r="1.1" fill="#fff"/>
      <ellipse class="lid" cx="50" cy="56" rx="8" ry="6.8" fill="#efe7da"/>
      <ellipse cx="70" cy="56" rx="7.5" ry="6.2" fill="#fffdf6" stroke="#8c7f6a" stroke-width="1.2"/>
      <rect class="pupil" x="66.5" y="53.8" width="7" height="4.4" rx="2" fill="#2a2622"/><circle cx="71.5" cy="54.6" r="1.1" fill="#fff"/>
      <ellipse class="lid" cx="70" cy="56" rx="8" ry="6.8" fill="#efe7da"/>
    </g>
    <ellipse cx="60" cy="77" rx="13.5" ry="10" fill="#ebdfcd" stroke="#c4b49b" stroke-width="1"/>
    <ellipse cx="55.5" cy="75" rx="2" ry="1.4" fill="#7b6a58"/>
    <ellipse cx="64.5" cy="75" rx="2" ry="1.4" fill="#7b6a58"/>
    <g class="jaw">
      <path d="M53 83 Q60 88 67 83" stroke="#7b6a58" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M54 89 Q60 108 66 89 Z" fill="#e9dfcd" stroke="#b9ad98" stroke-width="1.2"/>
    </g>
    ${braid()}
    <path class="sweat" d="M86 38 q4 6 0 9 q-4 -3 0 -9 z" fill="#8fd3ff" stroke="#3d8fc4" stroke-width="0.8"/>
  </g>
</svg>`;

export type GoatMood = 'idle' | 'chew' | 'cheer' | 'worried' | 'sad';

export class Goat {
  private timer = 0;
  constructor(private el: HTMLElement) {
    el.innerHTML = GOAT_SVG;
  }
  /** Short one-off reaction. */
  react(mood: 'chew' | 'cheer') {
    this.el.classList.remove('chew', 'cheer');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add(mood);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove(mood), 1100);
  }
  /** Ongoing state driven by the board. */
  setWorried(on: boolean) {
    this.el.classList.toggle('worried', on);
  }
  setSad(on: boolean) {
    this.el.classList.toggle('sad', on);
  }
}
