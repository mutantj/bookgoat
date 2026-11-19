// Adventure stages and their enemies, in the order they're fought. The first stage, the Tower Road, is the
// tutorial: a hay dummy that walks through the mechanics, then three trolls. Their numbers are in tuning.ts.
import trollSvg from '../../art/troll.svg?raw';
import dummySvg from '../../art/haydummy.svg?raw';
import bogSvg from '../../art/bogbeast.svg?raw';
import emberSvg from '../../art/embertroll.svg?raw';
import stoneSvg from '../../art/stonefolk.svg?raw';
import type { ArtifactId } from './artifacts';
import { TUNING, type Cut, type EnemyTuning, type PowerTuning } from './tuning';

/** What an enemy power sees about the word being played. */
export interface WordInfo {
  word: string;
  length: number;
  /** How many gem tiles the word uses. */
  gems: number;
  /** Rapunzel's word number this battle, 1 for the first. */
  turn: number;
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
  /** Whether this hit also smashes one of Rapunzel's tiles into rubble. Never more than `max` rubble at once. */
  smash?: { on(info: HitInfo): boolean; max: number };
  /** Whether the enemy's shield is up for Rapunzel's word number `turn`. */
  shieldUp?(turn: number): boolean;
  /** Letters this power affects. Their tiles are marked on the board while the enemy is fought: light red for a
   * hex, icy teal for frost. */
  marks?: { letters: string[]; style: 'hex' | 'frost' };
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
  biome: 'mountain' | 'swamp' | 'peaks';
  /** Rapunzel's health at the start of the stage, if not full. Health carries from one battle to the next. */
  startHp?: number;
  /** Arrive with the health the previous stage left her, instead of `startHp`. */
  carryHp?: boolean;
  /** The artifact won by clearing the stage. */
  reward?: ArtifactId;
  enemies: Enemy[];
}

/* ---------- Powers ----------
 * Each power is built from its entry in TUNING.enemies, and its description is written from the same numbers. */

const cut = (d: number, n: Cut) => (n.times !== undefined ? d * n.times : d - n.less);
const cutText = (n: Cut) => (n.times === undefined ? `${n.less} less` : n.times === 0.5 ? 'half' : `${n.times} times the`);
const timesText = (times: number) => (times === 2 ? 'double' : `${times} times the`);
const ordinal = (n: number) => ({ 2: 'other', 3: 'third', 4: 'fourth', 5: 'fifth' })[n] ?? `${n}th`;

/** Turn a power's tuning entry into the power the game uses. */
export function buildPower(p: PowerTuning): EnemyPower {
  const { name } = p;
  switch (p.kind) {
    case 'shortWords': {
      const min = TUNING.minWordLength;
      const words = p.under === min + 1 ? `${min}-letter words` : `Words under ${p.under} letters`;
      return { name, text: `${words} do ${cutText(p)} damage.`, damage: (d, w) => (w.length < p.under ? cut(d, p) : d) };
    }
    case 'letter': {
      const style = p.style ?? 'hex';
      return {
        name,
        text: `Words with a ${style === 'hex' ? 'hexed' : 'frozen'} ${p.letter} do ${cutText(p)} damage.`,
        marks: { letters: [p.letter], style },
        damage: (d, w) => (w.word.includes(p.letter.toLowerCase()) ? cut(d, p) : d),
      };
    }
    case 'noGem':
      return { name, text: `Words without a gem do ${cutText(p)} damage.`, damage: (d, w) => (w.gems ? d : cut(d, p)) };
    case 'everyNth':
      return {
        name,
        text: `Every ${ordinal(p.every)} hit does ${timesText(p.times)} damage.`,
        hit: (h, i) => (i.turn % p.every === 0 ? h * p.times : h),
      };
    case 'enraged': {
      const hard = p.times === 1.5 ? 'half again as hard' : p.times === 2 ? 'twice as hard' : `${p.times} times as hard`;
      const health = p.below === 0.5 ? 'half health' : `${Math.round(p.below * 100)}% health`;
      return { name, text: `Hits ${hard} below ${health}.`, hit: (h, i) => (i.health < p.below ? h * p.times : h) };
    }
    case 'rampUp':
      return { name, text: `Hits ${p.perTurn} harder every turn.`, hit: (h, i) => h + p.perTurn * (i.turn - 1) };
    case 'shield': {
      const up = (turn: number) => (turn - 1) % p.every === 0;
      const when = p.every === 1 ? 'every word' : `your first word and every ${ordinal(p.every)} word after`;
      return { name, text: `Up for ${when}: that word does ${cutText(p)} damage.`, shieldUp: up, damage: (d, w) => (up(w.turn) ? cut(d, p) : d) };
    }
    case 'smash': {
      const which = p.every === 1 ? 'Every hit' : `Every ${ordinal(p.every)} hit`;
      return {
        name,
        text: `${which} also smashes one of your tiles into rubble. Only the Stone Hammer clears rubble.`,
        smash: { on: (i) => i.turn % p.every === 0, max: p.max },
      };
    }
  }
}

/** An enemy's health, hit and powers from its tuning entry. */
const stats = (n: EnemyTuning) => ({ hp: n.hp, hit: n.hit, powers: n.powers.map(buildPower) });
const N = TUNING.enemies;

/* ---------- Enemies ---------- */

const TOWER_ROAD: Enemy[] = [
  {
    name: 'Hay Dummy',
    ...stats(N.hayDummy),
    art: dummySvg,
    taunt: '…',
    tutorial: true,
  },
  {
    name: 'Moss Troll',
    ...stats(N.mossTroll),
    art: trollSvg,
    taunt: 'Nobody crosses my bridge!',
  },
  {
    name: 'Frost Troll',
    ...stats(N.frostTroll),
    art: trollSvg,
    hue: 150,
    taunt: 'Brr. Your words feel cold already.',
  },
  {
    name: 'Ember Troll',
    ...stats(N.emberTroll),
    art: emberSvg, // its own colours and gold horns (the Golden Troll Horn comes from it), so no tint
    taunt: 'I eat goats for breakfast.',
  },
];

const SWAMP: Enemy[] = [
  {
    name: 'Mire Toad',
    ...stats(N.mireToad),
    art: bogSvg,
    taunt: 'Rapunzel squelches into the swamp, still sore from the trolls…',
  },
  {
    name: 'Bog Lurker',
    ...stats(N.bogLurker),
    art: bogSvg,
    hue: 200,
    taunt: 'Glub. Nobody leaves the bog.',
  },
  {
    name: 'Swamp Hag',
    ...stats(N.swampHag),
    art: bogSvg,
    hue: 260,
    taunt: 'A goat! Just what my stew needs.',
  },
];

const STONE_PASS: Enemy[] = [
  {
    name: 'Pebble Golem',
    ...stats(N.pebbleGolem),
    art: stoneSvg,
    taunt: 'The path climbs into the cold mountains, and the rocks begin to move…',
  },
  {
    name: 'Boulder Brute',
    ...stats(N.boulderBrute),
    art: stoneSvg,
    hue: 30,
    taunt: 'CRUSH. GOAT.',
  },
  {
    name: 'Stone Giant',
    ...stats(N.stoneGiant),
    art: stoneSvg,
    hue: 200,
    taunt: 'Little goat. The mountain does not move for you.',
  },
];

export const STAGES: Stage[] = [
  { name: 'The Tower Road', label: 'Tutorial', biome: 'mountain', reward: 'goldenHorn', enemies: TOWER_ROAD },
  { name: 'The Murky Swamp', label: 'Chapter 1', biome: 'swamp', carryHp: true, reward: 'shield', enemies: SWAMP },
  { name: 'The Stone Pass', label: 'Chapter 2', biome: 'peaks', carryHp: true, reward: 'hammer', enemies: STONE_PASS },
];

/** The artifacts won by clearing the stages before stage `s`: what she may hold when she restarts that stage. */
export const unlockedBefore = (s: number): ArtifactId[] => STAGES.slice(0, s).flatMap((x) => (x.reward ? [x.reward] : []));
