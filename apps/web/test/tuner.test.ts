import { describe, expect, it } from 'vitest';
import {
  hzToNote,
  median,
  midiToHz,
  nearestString,
  noteLabel,
  TUNINGS,
} from '../src/tuner/notes.ts';

const standard = TUNINGS[0]!;

describe('note maths', () => {
  it('names concert A and the open strings of a guitar', () => {
    expect(hzToNote(440)).toMatchObject({ name: 'A', octave: 4, cents: 0 });
    expect(hzToNote(110)).toMatchObject({ name: 'A', octave: 2, midi: 45 });
    expect(hzToNote(82.41)).toMatchObject({ name: 'E', octave: 2 });
    expect(standard.strings.map(noteLabel)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });

  it('reports how sharp or flat a note is in cents', () => {
    expect(hzToNote(445)?.cents).toBeCloseTo(19.6, 0);
    expect(hzToNote(435)?.cents).toBeCloseTo(-19.8, 0);
  });

  it('supports a different reference pitch', () => {
    expect(hzToNote(432, 432)).toMatchObject({ name: 'A', cents: 0 });
    expect(midiToHz(69, 442)).toBe(442);
  });

  it('rejects nonsense input', () => {
    expect(hzToNote(0)).toBeNull();
    expect(hzToNote(Number.NaN)).toBeNull();
    expect(hzToNote(-1)).toBeNull();
  });

  it('finds the nearest string in a tuning', () => {
    expect(nearestString(146.83, standard)).toMatchObject({ index: 2 });
    expect(nearestString(80, standard)?.index).toBe(0);
    expect(nearestString(80, standard)?.cents).toBeLessThan(0);
    expect(nearestString(0, standard)).toBeNull();
  });

  it('takes the median of recent readings to steady the needle', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
