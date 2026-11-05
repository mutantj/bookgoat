// Adventure enemies, in the order they're fought. The first one is the tutorial.
import trollSvg from '../../art/troll.svg?raw';
import dummySvg from '../../art/haydummy.svg?raw';

/** What an enemy power sees about the word being played. */
export interface WordInfo {
  word: string;
  length: number;
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

export const STAGE = 'The Tower Road';

export const ENEMIES: Enemy[] = [
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
