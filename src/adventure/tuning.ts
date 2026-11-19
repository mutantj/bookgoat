// Every Adventure number in one place, for tuning by playing. With `npm run dev` the game reloads
// as soon as this file is saved. Enemies and their powers are set here too; how each kind of power works is in enemies.ts.
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

  /**
   * Each enemy's health, its `hit` (damage to Rapunzel each turn, before powers) and its powers. A power has a name,
   * a `kind` and that kind's numbers; its description in the game is written from them. Any enemy can have any mix
   * of powers. The kinds (see PowerTuning below):
   * - `shortWords`: words under `under` letters do `less` less damage, or `times` the damage.
   * - `letter`: words using `letter` do `less` less damage, or `times` the damage. Its tiles are marked on the board
   *   (`style`: 'hex', the default, or 'frost').
   * - `noGem`: words without a gem tile do `less` less damage, or `times` the damage.
   * - `everyNth`: every `every`th hit does `times` the damage.
   * - `enraged`: hits do `times` the damage while the enemy's health is under `below` (0.5 = half).
   * - `rampUp`: hits get `perTurn` harder every turn.
   * - `shield`: her shield is up for Rapunzel's first word and every `every`th word after; that word does `less`
   *   less damage, or `times` the damage.
   * - `smash`: every `every`th hit also smashes a random tile (gems too) into rubble, which can't be used in a word
   *   until the Stone Hammer clears it. Never more than `max` rubble tiles on the board at once.
   */
  enemies: {
    // The Tower Road
    hayDummy: { hp: 30, hit: 2, powers: [] },
    mossTroll: { hp: 24, hit: 3, powers: [{ name: 'Thick moss', kind: 'shortWords', under: 4, less: 1 }] },
    frostTroll: { hp: 30, hit: 4, powers: [{ name: 'Icy hide', kind: 'shortWords', under: 5, times: 0.5 }] },
    emberTroll: { hp: 38, hit: 5, powers: [{ name: 'Thick skin', kind: 'letter', letter: 'O', less: 2 }] },
    // The Murky Swamp
    mireToad: {
      hp: 40,
      hit: 6,
      powers: [
        { name: 'Slime', kind: 'noGem', less: 2 },
        { name: 'Swampy', kind: 'everyNth', every: 3, times: 2 },
      ],
    },
    bogLurker: {
      hp: 52,
      hit: 7,
      powers: [
        { name: 'Murky', kind: 'shortWords', under: 5, times: 0.5 },
        { name: 'Lurk', kind: 'everyNth', every: 2, times: 1.5 },
      ],
    },
    swampHag: {
      hp: 66,
      hit: 8,
      powers: [
        { name: 'Hex', kind: 'letter', letter: 'A', less: 3 },
        { name: 'Shield', kind: 'shield', every: 3, less: 5 },
      ],
    },
    // The Stone Pass
    pebbleGolem: {
      hp: 50,
      hit: 8,
      powers: [
        { name: 'Hard shell', kind: 'shortWords', under: 5, less: 3 },
        { name: 'Avalanche', kind: 'rampUp', perTurn: 1 },
      ],
    },
    boulderBrute: {
      hp: 62,
      hit: 9,
      powers: [
        { name: 'Grit', kind: 'letter', letter: 'E', less: 3 },
        { name: 'Heavy fists', kind: 'everyNth', every: 3, times: 2 },
      ],
    },
    stoneGiant: {
      hp: 80,
      hit: 10,
      powers: [
        { name: 'Petrify', kind: 'letter', letter: 'S', less: 3 },
        { name: 'Avalanche', kind: 'rampUp', perTurn: 1.5 },
        { name: 'Bash', kind: 'smash', every: 2, max: 6 },
      ],
    },
  } satisfies Record<string, EnemyTuning>,

  /** How many artifacts Rapunzel can carry. Empty slots show beside the board. */
  artifactSlots: 3,
  /** `charge: 'words'` recharges during a fight from long words; `charge: 'battle'` is full at the start of every battle. */
  artifacts: {
    /** Golden Troll Horn, won on the Tower Road: tap it and the next word does `multiplier` times the damage.
     * Then it needs `rechargeWords` words of at least `rechargeLength` letters before it can be used again. */
    goldenHorn: { charge: 'words', multiplier: 2, rechargeLength: 6, rechargeWords: 2 },
    /** Swamp Shield, won in the Murky Swamp: tap it and the enemy's next hit does `block` less damage. Once a battle. */
    shield: { charge: 'battle', block: 5 },
    /** Stone Hammer, won on the Stone Pass: tap it, then a tile, to smash that tile and drop a new one. Once a battle. */
    hammer: { charge: 'battle' },
  },
};

/** A damage cut: `less` points off, or the damage multiplied by `times`. */
export type Cut = { less: number; times?: never } | { times: number; less?: never };

/** One enemy power, as written in TUNING.enemies: its name in the game, its kind and that kind's numbers. */
export type PowerTuning = { name: string } & (
  | ({ kind: 'shortWords'; under: number } & Cut)
  | ({ kind: 'letter'; letter: string; style?: 'hex' | 'frost' } & Cut)
  | ({ kind: 'noGem' } & Cut)
  | { kind: 'everyNth'; every: number; times: number }
  | { kind: 'enraged'; below: number; times: number }
  | { kind: 'rampUp'; perTurn: number }
  | ({ kind: 'shield'; every: number } & Cut)
  | { kind: 'smash'; every: number; max: number }
);

export interface EnemyTuning {
  hp: number;
  hit: number;
  powers: PowerTuning[];
}

/** Which enemy, by its key in TUNING.enemies. */
export type EnemyKey = keyof typeof TUNING.enemies;
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultyTuning {
  label: string;
  /** Start with the Hay Dummy tutorial. Without it, the Tower Road starts at the first troll. */
  tutorial: boolean;
  /** Gem tiles left on the board when she wins a fight stay in their places (letters too) for the next fight. */
  carryGems: boolean;
  /** Every enemy's health and hit are multiplied by these (and rounded), unless an override sets them. */
  hp: number;
  hit: number;
  /** Changes for single enemies on this difficulty. A number set here is used as it is (not multiplied), and
   * `powers` replaces the enemy's whole list. For example: stoneGiant: { hp: 130, powers: [...] } */
  overrides: Partial<Record<EnemyKey, Partial<EnemyTuning>>>;
}

/** The difficulties offered when a new Adventure starts. Easy is TUNING.enemies as it is. */
export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  easy: { label: 'Easy', tutorial: true, carryGems: false, hp: 1, hit: 1, overrides: {} },
  medium: { label: 'Medium', tutorial: false, carryGems: true, hp: 1.25, hit: 1.25, overrides: {} },
  hard: { label: 'Hard', tutorial: false, carryGems: true, hp: 1.5, hit: 1.5, overrides: {} },
};

/** An enemy's numbers and powers on a difficulty: the multipliers first, then any override. */
export function enemyTuning(key: EnemyKey, difficulty: Difficulty): EnemyTuning {
  const base: EnemyTuning = TUNING.enemies[key];
  const d = DIFFICULTY[difficulty];
  return { hp: Math.round(base.hp * d.hp), hit: Math.round(base.hit * d.hit), powers: base.powers, ...d.overrides[key] };
}

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
