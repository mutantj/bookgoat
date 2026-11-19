import { describe, expect, it } from 'vitest';
import type { Tile } from '../engine/board';
import { dict } from '../modes/mode';
import { STAGES, buildPower } from './enemies';
import { damageFor, gemTile, makeBoard, refill, smashTile, tilesFor, type Board } from './rules';
import { TUTORIAL, TUTORIAL_BOARD, TUTORIAL_REFILLS } from './tutorial';
import { TUNING, gemForLength } from './tuning';
import { ARTIFACTS, chargeAfterWord, chargeForBattle, isReady, shieldBlock, type OwnedArtifact } from './artifacts';

let nextId = 1;
const tile = (letter = 'X', kind: Tile['kind'] = 'normal'): Tile => ({ id: nextId++, letter, kind });
const letters = (board: Board) => board.map((col) => col.map((t) => t.letter).join(''));
const dummy = STAGES[0].enemies.find((e) => e.tutorial)!;

describe('adventure board', () => {
  it('spells a word from tiles anywhere on the board, preferring gems', () => {
    const board = makeBoard(() => tile(), ['GXXX', 'XXXO', 'XXXX', 'AXXT']);
    board[2][2] = tile('G', 'green');
    const tiles = tilesFor(board, 'goat')!;
    expect(tiles.map((p) => board[p.c][p.r].letter).join('')).toBe('GOAT');
    expect(board[tiles[0].c][tiles[0].r].kind).toBe('green');
    expect(tilesFor(board, 'goats')).toBeNull();
  });

  it('removes used tiles, drops the rest down and fills from the top', () => {
    const board = makeBoard(() => tile(), ['ABCD', 'EFGH', 'IJKL', 'MNOP']);
    const created = refill(board, [{ c: 0, r: 3 }, { c: 0, r: 1 }, { c: 2, r: 0 }], () => tile('Z'));
    expect(created).toHaveLength(3);
    expect(letters(board)).toEqual(['ZZAI', 'BFJN', 'ZGKO', 'DHLP']);
  });

  it('multiplies letters by length, gems and an artifact', () => {
    const word = [tile('G', 'green'), tile('O'), tile('A'), tile('T')];
    const base = 4 * TUNING.lengthMultiplier[4];
    const horn = TUNING.artifacts.goldenHorn.multiplier;
    expect(damageFor(word, dummy).total).toBe(Math.round(base * TUNING.gemMultiplier.green));
    const boosted = damageFor(word, dummy, { multiplier: horn, name: 'horn' });
    expect(boosted.total).toBe(Math.round(base * TUNING.gemMultiplier.green * horn));
    expect(boosted.math).toContain(`× ${horn} horn`);
  });

  it('lets enemy powers change the damage', () => {
    const moss = { ...dummy, powers: [buildPower({ name: 'Thick moss', kind: 'shortWords', under: 4, less: 1 })] };
    const cat = [tile('C'), tile('A'), tile('T')];
    expect(damageFor(cat, moss).total).toBe(damageFor(cat, dummy).total - 1);
  });
});

describe('rubble', () => {
  it('turns a tile, even a gem, into rubble that words skip', () => {
    const board = makeBoard(() => tile(), ['CATX', 'XXXX', 'XXXX', 'XXXX']);
    board[1][0].kind = 'gold';
    const p = smashTile(board, 6, (spots) => spots.find((q) => q.c === 1 && q.r === 0)!);
    expect(p).toEqual({ c: 1, r: 0 });
    expect(board[1][0]).toMatchObject({ rubble: true, kind: 'normal' });
    expect(tilesFor(board, 'cat')).toBeNull();
  });
  it('stops at the most rubble allowed', () => {
    const board = makeBoard(() => tile());
    const first = (spots: { c: number; r: number }[]) => spots[0];
    expect(smashTile(board, 2, first)).not.toBeNull();
    expect(smashTile(board, 2, first)).not.toBeNull();
    expect(smashTile(board, 2, first)).toBeNull();
  });
  it('names only the powers that changed the damage, and the shield only on its turns', () => {
    const shielded = { ...dummy, powers: [buildPower({ name: 'Shield', kind: 'shield', every: 3, less: 5 })] };
    const goats = [tile('G'), tile('O'), tile('A'), tile('T'), tile('S')];
    expect(damageFor(goats, shielded, undefined, 1).math).toContain('then Shield');
    expect(damageFor(goats, shielded, undefined, 2).math).not.toContain('Shield');
    expect(damageFor(goats, shielded, undefined, 2).total).toBe(damageFor(goats, dummy).total);
  });
});

describe('gem placement', () => {
  const first = (ts: Tile[]) => ts[0];
  const hexedE = (t: Tile) => t.letter === 'E';
  it('never puts a gem on a marked letter', () => {
    const created = [tile('E'), tile('E'), tile('R')];
    expect(gemTile(created, hexedE, first)!.letter).toBe('R');
  });
  it('uses the tutorial’s scripted tile when there is one', () => {
    const scripted = { ...tile('G'), fresh: true };
    expect(gemTile([tile('A'), scripted], hexedE, first)).toBe(scripted);
  });
  it('gives up when every new tile is marked, so the caller can re-letter one', () => {
    expect(gemTile([tile('E'), tile('E')], hexedE, first)).toBeNull();
  });
});

describe('gem powers', () => {
  it('a no-gem power takes damage off words without a gem', () => {
    const toad = { ...dummy, powers: [buildPower({ name: 'Slime', kind: 'noGem', less: 2 })] };
    const plain = [tile('C'), tile('A'), tile('T'), tile('S')];
    const gem = [tile('C', 'green'), tile('A'), tile('T'), tile('S')];
    expect(damageFor(plain, toad).total).toBe(damageFor(plain, dummy).total - 2);
    expect(damageFor(gem, toad).total).toBe(damageFor(gem, dummy).total);
  });
});

describe('artifacts', () => {
  it('long words charge an artifact until it is ready, and short words do nothing', () => {
    const { rechargeLength, rechargeWords } = TUNING.artifacts.goldenHorn;
    let owned: OwnedArtifact[] = [{ id: 'goldenHorn', charge: 0 }];
    owned = chargeAfterWord(owned, rechargeLength - 1);
    expect(owned[0].charge).toBe(0);
    for (let i = 0; i < rechargeWords + 2; i++) owned = chargeAfterWord(owned, rechargeLength);
    expect(owned[0].charge).toBe(rechargeWords);
    expect(isReady(owned[0])).toBe(true);
  });
});

describe('shield and hammer', () => {
  it('long words never charge the once-a-battle artifacts', () => {
    const owned: OwnedArtifact[] = [{ id: 'shield', charge: 0 }, { id: 'hammer', charge: 0 }];
    expect(chargeAfterWord(owned, 9)).toEqual(owned);
  });
  it('a new battle refills the shield and hammer but leaves the horn alone', () => {
    const owned: OwnedArtifact[] = [{ id: 'goldenHorn', charge: 0 }, { id: 'shield', charge: 0 }, { id: 'hammer', charge: 0 }];
    const refilled = chargeForBattle(owned);
    expect(refilled[0].charge).toBe(0);
    expect(isReady(refilled[1]) && isReady(refilled[2])).toBe(true);
  });
  it('the shield stops up to its block, never more than the hit', () => {
    const block = TUNING.artifacts.shield.block;
    expect(shieldBlock(block + 3)).toBe(block);
    expect(shieldBlock(2)).toBe(2);
  });
  it('every artifact says what it does and how it charges', () => {
    for (const info of Object.values(ARTIFACTS)) {
      expect(info.power().length).toBeGreaterThan(10);
      expect(info.charging().length).toBeGreaterThan(10);
    }
  });
});

describe('stages', () => {
  it('the Tower Road gives the horn, the swamp the shield and the Stone Pass the hammer', () => {
    expect(STAGES.map((st) => st.reward)).toEqual(['goldenHorn', 'shield', 'hammer']);
  });
  it('Rapunzel arrives at the swamp and the Stone Pass with the health the stage before left her', () => {
    expect(STAGES[1].carryHp).toBe(true);
    expect(STAGES[1].startHp).toBeUndefined();
    expect(STAGES[2].carryHp).toBe(true);
    expect(STAGES[2].enemies).toHaveLength(3);
  });
});

describe('tutorial script', () => {
  it('always has the letters for each word step, and GOAT gets the gem', () => {
    const refills = [...TUTORIAL_REFILLS];
    const make = () => {
      const s = refills.shift() ?? 'X';
      return tile(s.replace('*', ''), s.endsWith('*') ? 'green' : 'normal');
    };
    const board = makeBoard(() => tile(), TUTORIAL_BOARD);
    for (const step of TUTORIAL) {
      if (step.action !== 'word' || !step.word) continue;
      expect(dict.has(step.word)).toBe(true);
      const used = tilesFor(board, step.word);
      expect(used, `board can spell ${step.word}`).not.toBeNull();
      if (step.word === 'goat') expect(used!.some((p) => board[p.c][p.r].kind !== 'normal')).toBe(true);
      // The real game marks one new tile as the gem only when the word is long enough.
      const created = refill(board, used!, make);
      if (!gemForLength(step.word.length)) for (const t of created) t.kind = 'normal';
    }
  });
});
