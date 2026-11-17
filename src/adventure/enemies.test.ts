import { describe, expect, it } from 'vitest';
import { STAGES, buildPower, unlockedBefore } from './enemies';
import { TUNING, type PowerTuning } from './tuning';

const word = (w: string, gems = 0) => ({ word: w, length: w.length, gems });
const hitOn = (p: PowerTuning, turn: number, health = 1) => buildPower(p).hit!(10, { turn, health });

describe('adventure stages', () => {
  it('lists the artifacts won before each stage, for Restart chapter', () => {
    expect(unlockedBefore(0)).toEqual([]);
    expect(unlockedBefore(1)).toEqual([STAGES[0].reward]);
    expect(unlockedBefore(2)).toEqual([STAGES[0].reward, STAGES[1].reward]);
    expect(unlockedBefore(2)).not.toContain(STAGES[2].reward);
  });

  it('takes every enemy’s health, hit and powers from TUNING, in order', () => {
    const all = STAGES.flatMap((st) => st.enemies);
    const tuned = Object.values(TUNING.enemies);
    expect(all.map((e) => [e.hp, e.hit, e.powers.map((p) => p.name)])).toEqual(tuned.map((n) => [n.hp, n.hit, n.powers.map((p) => p.name)]));
  });
});

// Made-up numbers, so these hold whatever the shipped tuning is.
describe('enemy power kinds', () => {
  it('shortWords cuts damage for short words', () => {
    const less = buildPower({ name: 'x', kind: 'shortWords', under: 5, less: 2 });
    expect(less.text).toBe('Words under 5 letters do 2 less damage.');
    expect(less.damage!(10, word('goat'))).toBe(8);
    expect(less.damage!(10, word('goats'))).toBe(10);
    const half = buildPower({ name: 'x', kind: 'shortWords', under: TUNING.minWordLength + 1, times: 0.5 });
    expect(half.text).toBe(`${TUNING.minWordLength}-letter words do half damage.`);
  });

  it('letter marks its letter and cuts damage for words that use it', () => {
    const hex = buildPower({ name: 'x', kind: 'letter', letter: 'E', less: 3 });
    expect(hex.text).toBe('Words with a hexed E do 3 less damage.');
    expect(hex.marks).toEqual({ letters: ['E'], style: 'hex' });
    expect(hex.damage!(10, word('tree'))).toBe(7);
    expect(hex.damage!(10, word('toad'))).toBe(10);
    const frost = buildPower({ name: 'x', kind: 'letter', letter: 'S', times: 0.75, style: 'frost' });
    expect(frost.text).toBe('Words with a frozen S do 0.75 times the damage.');
  });

  it('noGem cuts damage for words without a gem', () => {
    const slime = buildPower({ name: 'x', kind: 'noGem', less: 2 });
    expect(slime.text).toBe('Words without a gem do 2 less damage.');
    expect(slime.damage!(10, word('cats'))).toBe(8);
    expect(slime.damage!(10, word('cats', 1))).toBe(10);
  });

  it('everyNth, enraged and rampUp change the hit on the right turns', () => {
    const third: PowerTuning = { name: 'x', kind: 'everyNth', every: 3, times: 2 };
    expect(buildPower(third).text).toBe('Every third hit does double damage.');
    expect([hitOn(third, 2), hitOn(third, 3)]).toEqual([10, 20]);
    expect(buildPower({ name: 'x', kind: 'everyNth', every: 2, times: 1.5 }).text).toBe('Every other hit does 1.5 times the damage.');

    const temper: PowerTuning = { name: 'x', kind: 'enraged', below: 0.5, times: 1.5 };
    expect(buildPower(temper).text).toBe('Hits half again as hard below half health.');
    expect([hitOn(temper, 1, 0.4), hitOn(temper, 1, 0.6)]).toEqual([15, 10]);

    const ramp: PowerTuning = { name: 'x', kind: 'rampUp', perTurn: 2 };
    expect(buildPower(ramp).text).toBe('Hits 2 harder every turn.');
    expect([hitOn(ramp, 1), hitOn(ramp, 3)]).toEqual([10, 14]);
  });
});
