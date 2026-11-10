// Every Adventure number in one place, for tuning by playing. With `npm run dev` the game reloads
// as soon as this file is saved. Enemy health, hits and powers are in enemies.ts.
import { RULES, type GemKind } from '../engine/rules';

export const TUNING = {
  minWordLength: 3,

  hero: { hp: 30 },
  /** Damage past what finishes an enemy heals Rapunzel by this much per point (1 = all of it), up to full health. */
  overkillHeal: 1,

  /** Damage per letter, before multipliers. Starts as a copy of Classic's letter values. */
  letterDamage: { ...RULES.letterValues } as Record<string, number>,

  /** The letters' damage is multiplied by this for the word's length ("Qu" counts as 2 letters). */
  lengthMultiplier: { 3: 1, 4: 1.25, 5: 1.5, 6: 2, 7: 2.5, 8: 3 } as Record<number, number>,
  /** Each letter past the end of the table adds this much more. */
  lengthMultiplierStep: 0.5,

  /** A word at least this long leaves one gem tile among the new letters; longer words leave better gems. */
  gemForLength: { 5: 'green', 6: 'gold', 7: 'sapphire', 8: 'diamond', 9: 'crystal' } as Record<number, GemKind>,
  /** Each gem tile used in a word multiplies its damage. */
  gemMultiplier: { green: 1.25, gold: 1.5, sapphire: 1.75, diamond: 2, crystal: 3 } as Record<GemKind, number>,

  /** Damage is rounded to a whole number, and a real word always does at least this much. */
  minDamage: 1,

  /** How many artifacts Rapunzel can carry. Empty slots show beside the board. */
  artifactSlots: 3,
  artifacts: {
    /** Golden Troll Horn, won by clearing the Tower Road: tap it and the next word does this many times the damage.
     * Then it needs `rechargeWords` words of at least `rechargeLength` letters before it can be used again. */
    goldenHorn: { multiplier: 2, rechargeLength: 6, rechargeWords: 2 },
  },
};

export function lengthMultiplier(length: number): number {
  const table = TUNING.lengthMultiplier;
  if (table[length] !== undefined) return table[length];
  const longest = Math.max(...Object.keys(table).map(Number));
  if (length < longest) return 1;
  return table[longest] + (length - longest) * TUNING.lengthMultiplierStep;
}

export function gemForLength(length: number): GemKind | null {
  let gem: GemKind | null = null;
  for (const [len, kind] of Object.entries(TUNING.gemForLength)) if (length >= Number(len)) gem = kind;
  return gem;
}
