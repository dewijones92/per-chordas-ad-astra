import { describe, expect, it } from 'vitest';
import { sideFor, suggestFingering, type FingerNote } from '../src/music/suggest-fingering.ts';

const seq = (pitches: readonly number[], step = 0.5): FingerNote[] =>
  pitches.map((pitch, i) => ({ pitch, start: i * step, end: i * step + step * 0.9 }));

const chord = (pitches: readonly number[], start = 0): FingerNote[] =>
  pitches.map((pitch) => ({ pitch, start, end: start + 1 }));

const fingers = (notes: readonly FingerNote[], hand: 'right' | 'left') => {
  const out = suggestFingering(notes, hand);
  return notes.map((n) => out.get(n) ?? 0);
};

const C_MAJOR_UP = [60, 62, 64, 65, 67, 69, 71, 72];

describe('suggested fingering', () => {
  it('fingers the C major scale the way it is taught, both hands', () => {
    expect(fingers(seq(C_MAJOR_UP), 'right')).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(fingers(seq(C_MAJOR_UP.map((p) => p - 12)), 'left')).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
    expect(fingers(seq([...C_MAJOR_UP].reverse()), 'right')).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });

  it('keeps a five-finger position on one finger per key', () => {
    expect(fingers(seq([60, 62, 64, 65, 67, 65, 64, 62, 60]), 'right')).toEqual([
      1, 2, 3, 4, 5, 4, 3, 2, 1,
    ]);
    expect(fingers(seq([48, 50, 52, 53, 55]), 'left')).toEqual([5, 4, 3, 2, 1]);
  });

  it('fingers a triad 1-3-5 from the bottom in the right hand and 5-3-1 in the left', () => {
    expect(fingers(chord([60, 64, 67]), 'right')).toEqual([1, 3, 5]);
    expect(fingers(chord([48, 52, 55]), 'left')).toEqual([5, 3, 1]);
  });

  it('never gives two notes of one chord the same finger, and fingers rise with pitch in the right hand', () => {
    const notes = [...chord([60, 64, 67], 0), ...chord([62, 65, 69], 1), ...chord([59, 62, 67], 2)];
    const out = suggestFingering(notes, 'right');
    for (const start of [0, 1, 2]) {
      const group = notes.filter((n) => n.start === start).sort((a, b) => a.pitch - b.pitch);
      const fs = group.map((n) => out.get(n) ?? 0);
      expect(new Set(fs).size).toBe(fs.length);
      expect([...fs].sort((a, b) => a - b)).toEqual(fs);
    }
  });

  it('avoids the thumb on a black key where a white-key thumb will do', () => {
    const fs = fingers(seq([62, 63, 65, 67, 69]), 'right');
    expect(fs[1]).not.toBe(1);
  });

  it('gives every note a finger from 1 to 5, even a chord too wide to play', () => {
    const notes = chord([48, 60, 64, 67, 72, 76]);
    for (const f of fingers(notes, 'right')) expect(f).toBeGreaterThanOrEqual(1);
    for (const f of fingers(notes, 'right')) expect(f).toBeLessThanOrEqual(5);
  });

  it('handles a long piece quickly', () => {
    const many = seq(
      Array.from({ length: 4000 }, (_, i) => 60 + ((i * 7) % 15)),
      0.1,
    );
    const t0 = performance.now();
    suggestFingering(many, 'right');
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe('which hand a note is suggested for', () => {
  it('follows the lane, and splits a single staff at middle C', () => {
    expect(sideFor('left', 80, 60)).toBe('left');
    expect(sideFor('right', 40, 60)).toBe('right');
    expect(sideFor('single', 59, 60)).toBe('left');
    expect(sideFor(undefined, 60, 60)).toBe('right');
  });
});
