// Rapunzel: an original goat with a long golden braid. The drawing lives in art/rapunzel.svg
// (edit it in Inkscape); parts with class jaw, lid, pupil, ear-l and sweat are animated in style.css.
import rapunzelSvg from '../../art/rapunzel.svg?raw';

// Drop the XML declaration and any comments so the file can be inlined into the page.
const GOAT_SVG = rapunzelSvg.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, '').trim();

let instances = 0;
/** Ids must be unique per page, so each copy of the goat gets its own prefix on ids and #references. */
function withUniqueIds(svg: string): string {
  const prefix = `goat${++instances}-`;
  return svg.replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`).replace(/(url\(#|href="#)([^)"]+)/g, `$1${prefix}$2`);
}

export type GoatMood = 'idle' | 'chew' | 'cheer' | 'worried' | 'sad';

export class Goat {
  private timer = 0;
  constructor(private el: HTMLElement) {
    el.innerHTML = withUniqueIds(GOAT_SVG);
  }
  /** Short one-off reaction. */
  react(mood: 'chew' | 'cheer') {
    this.el.classList.remove('chew', 'cheer');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add(mood);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove(mood), 1100);
  }
  /** Mouth wide open, waiting for tiles to fly in. */
  openMouth(on: boolean) {
    this.el.classList.toggle('mouth-open', on);
    if (!on) this.el.classList.remove('bite');
  }
  /** One quick chomp on whatever just arrived. */
  bite() {
    this.el.classList.remove('bite');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add('bite');
  }
  /** Ongoing state driven by the board. */
  setWorried(on: boolean) {
    this.el.classList.toggle('worried', on);
  }
  setSad(on: boolean) {
    this.el.classList.toggle('sad', on);
  }
}
