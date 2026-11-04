import { describe, expect, it } from 'vitest';
import { learnKeyShift } from '../src/music/learn-key.ts';

describe('starting a piece in C major or A minor', () => {
  it('moves a major key to C and a minor key to A, by the nearest way', () => {
    expect(learnKeyShift({ fifths: 1, minor: false })).toBe(5);
    expect(learnKeyShift({ fifths: -3, minor: false })).toBe(-3);
    expect(learnKeyShift({ fifths: 2, minor: false })).toBe(-2);
    expect(learnKeyShift({ fifths: -5, minor: true })).toBe(-1);
    expect(learnKeyShift({ fifths: 1, minor: true })).toBe(5);
    expect(learnKeyShift({ fifths: -1, minor: true })).toBe(-5);
  });

  it('leaves C major and A minor alone, and never moves more than six semitones', () => {
    expect(learnKeyShift({ fifths: 0, minor: false })).toBe(0);
    expect(learnKeyShift({ fifths: 0, minor: true })).toBe(0);
    for (let fifths = -7; fifths <= 7; fifths++) {
      for (const minor of [false, true]) {
        const shift = learnKeyShift({ fifths, minor });
        expect(Math.abs(shift)).toBeLessThanOrEqual(6);
        const tonic = (((fifths * 7 + (minor ? 9 : 0)) % 12) + 12) % 12;
        expect((((tonic + shift) % 12) + 12) % 12).toBe(minor ? 9 : 0);
      }
    }
  });
});
