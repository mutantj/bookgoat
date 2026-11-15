import { describe, expect, it } from 'vitest';
import { STAGES, unlockedBefore } from './enemies';

describe('adventure stages', () => {
  it('lists the artifacts won before each stage, for Restart chapter', () => {
    expect(unlockedBefore(0)).toEqual([]);
    expect(unlockedBefore(1)).toEqual([STAGES[0].reward]);
    expect(unlockedBefore(2)).toEqual([STAGES[0].reward, STAGES[1].reward]);
    expect(unlockedBefore(2)).not.toContain(STAGES[2].reward);
  });
});
