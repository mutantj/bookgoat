// Adventure stages and their enemies, in the order they're fought. The first stage, the Tower Road, is the
// tutorial: a hay dummy that walks through the mechanics, then three trolls.
import trollSvg from '../../art/troll.svg?raw';
import dummySvg from '../../art/haydummy.svg?raw';
import bogSvg from '../../art/bogbeast.svg?raw';
import type { ArtifactId } from './artifacts';

/** What an enemy power sees about the word being played. */
export interface WordInfo {
  word: string;
  length: number;
  /** How many gem tiles the word uses. */
  gems: number;
}

/** What an enemy power sees when the enemy is about to hit. */
export interface HitInfo {
  /** 1 on the enemy's first hit of the battle. */
  turn: number;
  /** Enemy health left, 0 to 1. */
  health: number;
}

export interface EnemyPower {
  name: string;
  text: string;
  /** Change how much damage a word does to this enemy. */
  damage?(damage: number, word: WordInfo): number;
  /** Change how hard this enemy hits. */
  hit?(hit: number, info: HitInfo): number;
}

export interface Enemy {
  name: string;
  hp: number;
  /** Damage to Rapunzel each turn, before powers. */
  hit: number;
  art: string;
  /** Tints the art (degrees). */
  hue?: number;
  taunt: string;
  powers: EnemyPower[];
  /** The first battle walks through the mechanics step by step. */
  tutorial?: boolean;
}

export interface Stage {
  name: string;
  /** Shown above the name in the top bar. */
  label: string;
  /** Sets the arena's scenery (see adventure.css). */
  biome: 'mountain' | 'swamp';
  /** Rapunzel's health at the start of the stage, if not full. Health carries from one battle to the next. */
  startHp?: number;
  /** The artifact won by clearing the stage. */
  reward?: ArtifactId;
  enemies: Enemy[];
}

const TOWER_ROAD: Enemy[] = [
  {
    name: 'Hay Dummy',
    hp: 30,
    hit: 2,
    art: dummySvg,
    taunt: '…',
    powers: [],
    tutorial: true,
  },
  {
    name: 'Moss Troll',
    hp: 24,
    hit: 3,
    art: trollSvg,
    taunt: 'Nobody crosses my bridge!',
    powers: [{ name: 'Thick moss', text: '3-letter words do 1 less damage.', damage: (d, w) => (w.length === 3 ? d - 1 : d) }],
  },
  {
    name: 'Frost Troll',
    hp: 30,
    hit: 4,
    art: trollSvg,
    hue: 150,
    taunt: 'Brr. Your words feel cold already.',
    powers: [
      { name: 'Icy hide', text: 'Words with an S do 2 less damage.', damage: (d, w) => (w.word.includes('s') ? d - 2 : d) },
      { name: 'Chill', text: 'Every third hit does double damage.', hit: (h, i) => (i.turn % 3 === 0 ? h * 2 : h) },
    ],
  },
  {
    name: 'Ember Troll',
    hp: 38,
    hit: 5,
    art: trollSvg,
    hue: 280,
    taunt: 'I eat goats for breakfast.',
    powers: [
      { name: 'Thick skin', text: 'Words under 5 letters do half damage.', damage: (d, w) => (w.length < 5 ? d / 2 : d) },
      { name: 'Hot temper', text: 'Hits half again as hard below half health.', hit: (h, i) => (i.health < 0.5 ? h * 1.5 : h) },
    ],
  },
];

const SWAMP: Enemy[] = [
  {
    name: 'Mire Toad',
    hp: 40,
    hit: 4,
    art: bogSvg,
    taunt: 'Rapunzel squelches into the swamp, still sore from the trolls…',
    powers: [{ name: 'Slime', text: 'Words without a gem do 2 less damage.', damage: (d, w) => (w.gems ? d : d - 2) }],
  },
  {
    name: 'Bog Lurker',
    hp: 52,
    hit: 5,
    art: bogSvg,
    hue: 200,
    taunt: 'Glub. Nobody leaves the bog.',
    powers: [
      { name: 'Murky', text: 'Words under 4 letters do half damage.', damage: (d, w) => (w.length < 4 ? d / 2 : d) },
      { name: 'Lurk', text: 'Every other hit does 1.5 times the damage.', hit: (h, i) => (i.turn % 2 === 0 ? h * 1.5 : h) },
    ],
  },
  {
    name: 'Swamp Hag',
    hp: 66,
    hit: 5,
    art: bogSvg,
    hue: 260,
    taunt: 'A goat! Just what my stew needs.',
    powers: [
      { name: 'Hex', text: 'Words with an E do 3 less damage.', damage: (d, w) => (w.word.includes('e') ? d - 3 : d) },
      { name: 'Bubbling brew', text: 'Hits 1 harder every turn.', hit: (h, i) => h + i.turn - 1 },
    ],
  },
];

export const STAGES: Stage[] = [
  { name: 'The Tower Road', label: 'Tutorial', biome: 'mountain', reward: 'goldenHorn', enemies: TOWER_ROAD },
  { name: 'The Murky Swamp', label: 'Chapter 1', biome: 'swamp', startHp: 10, enemies: SWAMP },
];
