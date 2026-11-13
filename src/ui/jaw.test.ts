import { describe, expect, it } from 'vitest';
import { LIP_SYNC, jawFrames } from './jaw';

describe('jaw tracks', () => {
  it('opens on loud sound, shuts in silence, and closes over a few frames', () => {
    const rate = 3000;
    const frame = rate / LIP_SYNC.fps; // 100 samples
    // 5 frames of silence, 5 frames of a steady loud tone, 10 frames of silence.
    const samples = Array.from({ length: frame * 20 }, (_, i) => (i >= frame * 5 && i < frame * 10 ? (i % 2 ? 0.8 : -0.8) : 0));
    const jaw = jawFrames(samples, rate);
    expect(jaw).toHaveLength(20);
    expect(jaw.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    for (const j of jaw.slice(5, 10)) expect(j).toBeGreaterThan(90);
    // After the tone the mouth closes gradually, not all at once.
    expect(jaw[10]).toBeGreaterThan(0);
    expect(jaw[10]).toBeLessThan(jaw[9]);
    for (let i = 11; i < 20; i++) expect(jaw[i]).toBeLessThan(jaw[i - 1]);
    expect(jaw[19]).toBeLessThan(10);
  });

  it('treats very quiet frames as silence', () => {
    const rate = 3000;
    const frame = rate / LIP_SYNC.fps;
    const samples = Array.from({ length: frame * 4 }, (_, i) => (i < frame * 2 ? 0.8 : 0.01) * (i % 2 ? 1 : -1));
    const jaw = jawFrames(samples, rate, { ...LIP_SYNC, release: 0 });
    expect(jaw[3]).toBe(0);
  });
});
