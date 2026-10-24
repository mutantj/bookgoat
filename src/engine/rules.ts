// All tunable numbers live here so we can tune toward the original's feel
// without touching engine code. Values are best guesses — see parity pass (plan step 9).

export type GemKind = 'green' | 'gold' | 'sapphire' | 'diamond' | 'crystal';
export type TileKind = 'normal' | 'burning' | GemKind;

export const RULES = {
  cols: 7,
  rows: 8,
  minWordLength: 3,

  /** Points per letter before multipliers. Rarer letters are worth more. */
  letterValues: {
    A: 1, B: 1.25, C: 1.25, D: 1, E: 1, F: 1.25, G: 1, H: 1.25, I: 1, J: 1.75, K: 1.75, L: 1, M: 1.25,
    N: 1, O: 1, P: 1.25, Qu: 2.75, R: 1, S: 1, T: 1, U: 1, V: 1.5, W: 1.5, X: 2, Y: 1.5, Z: 2,
  } as Record<string, number>,

  /** Relative chance of each letter appearing on a new tile. */
  letterWeights: {
    A: 8.2, B: 1.8, C: 2.8, D: 4.0, E: 11.5, F: 2.0, G: 2.4, H: 4.0, I: 7.6, J: 0.25, K: 0.9, L: 4.6, M: 2.6,
    N: 6.7, O: 7.2, P: 2.2, Qu: 0.35, R: 6.4, S: 6.2, T: 7.0, U: 3.2, V: 1.0, W: 1.6, X: 0.3, Y: 1.8, Z: 0.25,
  } as Record<string, number>,

  vowels: ['A', 'E', 'I', 'O', 'U'],
  /** If the board has fewer vowels than this share, new tiles lean toward vowels. */
  minVowelShare: 0.3,
  /** Never let more than this many of one rare letter sit on the board. */
  maxRareCopies: 2,
  rareLetters: ['J', 'K', 'Qu', 'V', 'W', 'X', 'Y', 'Z'],

  /** Word-length multiplier (length counts "Qu" as two letters). */
  lengthMultiplier(len: number): number {
    const table: Record<number, number> = { 3: 1, 4: 1.5, 5: 2, 6: 2.5, 7: 3, 8: 3.5, 9: 4, 10: 4.5 };
    return len >= 11 ? 5 + (len - 11) * 0.5 : table[len] ?? 1;
  },
  pointScale: 10,

  /** Long words create a gem tile in the refill. */
  gemForLength(len: number): GemKind | null {
    if (len >= 10) return 'crystal';
    if (len === 9) return 'diamond';
    if (len === 8) return 'sapphire';
    if (len === 7) return 'gold';
    if (len === 6) return 'green';
    return null;
  },
  gemMultiplier: { green: 1.25, gold: 1.5, sapphire: 1.75, diamond: 2, crystal: 3 } as Record<GemKind, number>,
  /** Using a burning tile in a word is worth a little extra. */
  burningTileBonus: 1.1,

  burn: {
    /** Chance a burning tile appears after a word of this length (before level scaling). */
    spawnChanceByLength: { 3: 0.3, 4: 0.14, 5: 0.04 } as Record<number, number>,
    perLevel: 0.025,
    maxOnBoard(level: number) {
      return 1 + Math.floor(level / 3);
    },
    scrambleAdds: 1,
  },

  /** Points needed to clear a level. */
  levelTarget(level: number): number {
    return 400 + (level - 1) * 150;
  },
  bonusWordPoints(level: number): number {
    return 150 + level * 50;
  },
} as const;
