import { describe, expect, it } from 'vitest';
import { TUNING, gemForLength, lengthMultiplier } from './tuning';

describe('adventure tuning', () => {
  it('uses the length table, then steps up past its end', () => {
    const table = TUNING.lengthMultiplier;
    const longest = Math.max(...Object.keys(table).map(Number));
    expect(lengthMultiplier(3)).toBe(table[3]);
    expect(lengthMultiplier(longest + 2)).toBe(table[longest] + 2 * TUNING.lengthMultiplierStep);
  });

  it('gives no gem to short words and the best gem that fits a long one', () => {
    const lengths = Object.keys(TUNING.gemForLength).map(Number);
    const shortest = Math.min(...lengths);
    expect(gemForLength(shortest - 1)).toBeNull();
    expect(gemForLength(shortest)).toBe(TUNING.gemForLength[shortest]);
    expect(gemForLength(99)).toBe(TUNING.gemForLength[Math.max(...lengths)]);
  });
});
