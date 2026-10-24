// Small seeded RNG (mulberry32). State is a single number so games can be saved and replayed.
export class Rng {
  constructor(public state: number) {}
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
  weighted(weights: Record<string, number>): string {
    const entries = Object.entries(weights);
    let total = 0;
    for (const [, w] of entries) total += w;
    let roll = this.next() * total;
    for (const [k, w] of entries) {
      roll -= w;
      if (roll < 0) return k;
    }
    return entries[entries.length - 1][0];
  }
}
