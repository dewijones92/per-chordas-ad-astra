import { describe, expect, it } from 'vitest';
import { chordLabels, nameChord, type ChordNote } from '../src/music/chords.ts';

const C = 48;
const bar = (number: number, start: number, end: number, beats = 3) => ({
  number,
  start,
  end,
  beats,
});
const at = (start: number, ...pitches: number[]): ChordNote[] =>
  pitches.map((pitch) => ({ pitch, start }));

describe('naming a chord', () => {
  it.each([
    ['C major', [C, C + 4, C + 7], 'C'],
    ['A minor', [45, 48, 52], 'Am'],
    ['G dominant seventh', [43, 47, 50, 53], 'G7'],
    ['D minor seventh', [50, 53, 57, 60], 'Dm7'],
    ['C major seventh', [C, C + 4, C + 7, C + 11], 'Cmaj7'],
    ['B diminished', [47, 50, 53], 'Bdim'],
    ['C augmented', [C, C + 4, C + 8], 'Caug'],
    ['G suspended fourth', [43, 48, 50], 'Gsus4'],
    ['D suspended second', [50, 52, 57], 'Dsus2'],
    ['B half-diminished', [47, 50, 53, 57], 'Bm7♭5'],
    ['C diminished seventh', [C, C + 3, C + 6, C + 9], 'Cdim7'],
    ['C sixth', [C, C + 4, C + 7, C + 9], 'C6'],
    ['C add nine', [C, C + 2, C + 4, C + 7], 'Cadd9'],
    ['a seventh without its fifth', [43, 47, 53], 'G7'],
  ])('%s', (_label, pitches, expected) => {
    expect(nameChord(pitches, false)).toBe(expected);
  });

  it('names inversions as slash chords over the lowest note', () => {
    expect(nameChord([52, 55, 60], false)).toBe('C/E');
    expect(nameChord([55, 60, 64], false)).toBe('C/G');
    expect(nameChord([57, 62, 65], false)).toBe('Dm/A');
    expect(nameChord([47, 50, 53, 55], false)).toBe('G7/B');
  });

  it('prefers the lowest note as the root when two names share the same notes', () => {
    expect(nameChord([45, 48, 52, 55], false)).toBe('Am7');
    expect(nameChord([48, 52, 55, 57], false)).toBe('C6');
    expect(nameChord([53, 57, 60, 62], false)).toBe('F6');
  });

  it('ignores octaves and doublings', () => {
    expect(nameChord([36, 48, 52, 55, 64, 67, 72], false)).toBe('C');
  });

  it('spells with flats or sharps as asked', () => {
    expect(nameChord([46, 50, 53], true)).toBe('B♭');
    expect(nameChord([46, 50, 53], false)).toBe('A♯');
    expect(nameChord([46, 49, 53], true)).toBe('B♭m');
    expect(nameChord([54, 57, 60], false)).toBe('F♯dim');
    expect(nameChord([50, 54, 57], false)).toBe('D');
    expect(nameChord([53, 57, 60, 63], true)).toBe('F7');
    expect(nameChord([55, 58, 62], true)).toBe('Gm');
    expect(nameChord([50, 53, 58], true)).toBe('B♭/D');
  });

  it('names a third on its own as the triad it implies, as a waltz bass leaves it', () => {
    expect(nameChord([43, 55, 59], false)).toBe('G');
    expect(nameChord([45, 57, 60], false)).toBe('Am');
    expect(nameChord([47, 55, 59], false)).toBe('G/B');
  });

  it('names nothing for one note, an octave, or a bare fifth', () => {
    expect(nameChord([], false)).toBeNull();
    expect(nameChord([43], false)).toBeNull();
    expect(nameChord([43, 55], false)).toBeNull();
    expect(nameChord([43, 50], false)).toBeNull();
  });

  it('names the chord above a bass that is not part of it, as a slash chord', () => {
    expect(nameChord([38, 57, 60], false)).toBe('Am/D');
    expect(nameChord([38, 55, 59, 55, 59], false)).toBe('G/D');
    expect(nameChord([48, 52, 55, 59, 62], false)).toBe('Em7/C');
  });

  it('names nothing for a cluster that is no chord', () => {
    expect(nameChord([60, 61, 62], false)).toBeNull();
    expect(nameChord([60, 62, 64, 65, 67, 69, 71], false)).toBeNull();
  });
});

describe('chord labels along the bars', () => {
  it('reads a waltz bar, bass then two chords, as one chord at the bass', () => {
    const notes = [...at(0, 43), ...at(0.5, 59, 62), ...at(1, 59, 62)];
    expect(chordLabels(notes, [bar(1, 0, 1.5)], 0, false)).toEqual([{ start: 0, name: 'G' }]);
  });

  it('labels a new harmony and drops one that only repeats the last', () => {
    const notes = [
      ...at(0, 43, 47, 50),
      ...at(1.5, 43, 47, 50),
      ...at(3, 48, 52, 55),
      ...at(4.5, 48, 52, 55),
    ];
    const bars = [bar(1, 0, 1.5), bar(2, 1.5, 3), bar(3, 3, 4.5), bar(4, 4.5, 6)];
    expect(chordLabels(notes, bars, 0, false)).toEqual([
      { start: 0, name: 'G' },
      { start: 3, name: 'C' },
    ]);
  });

  it('labels the same chord again after a bar that names nothing', () => {
    const notes = [...at(0, 48, 52, 55), ...at(1.5, 50), ...at(3, 48, 52, 55)];
    const bars = [bar(1, 0, 1.5), bar(2, 1.5, 3), bar(3, 3, 4.5)];
    expect(chordLabels(notes, bars, 0, false).map((l) => l.name)).toEqual(['C', 'C']);
  });

  it('splits a bar into halves when the whole bar is no chord, naming each', () => {
    const notes = [...at(0, 48, 52, 55), ...at(1, 54, 57, 61)];
    expect(chordLabels(notes, [bar(1, 0, 2)], 0, false)).toEqual([
      { start: 0, name: 'C' },
      { start: 1, name: 'F♯m' },
    ]);
  });

  it('reads a bar of four beats as two chords when each half is one, and a bar of three as one', () => {
    const notes = [...at(0, 48, 52, 55), ...at(1, 57, 60, 64)];
    expect(chordLabels(notes, [bar(1, 0, 2, 4)], 0, false)).toEqual([
      { start: 0, name: 'C' },
      { start: 1, name: 'Am' },
    ]);
    expect(chordLabels(notes, [bar(1, 0, 2, 3)], 0, false)).toEqual([{ start: 0, name: 'C6' }]);
  });

  it('does not call a bass that walks round the same chord a new harmony', () => {
    const notes = [
      ...at(0, 38, 55, 59),
      ...at(1.5, 43, 55, 59),
      ...at(3, 38, 55, 59),
      ...at(4.5, 48, 52, 55),
    ];
    const bars = [bar(1, 0, 1.5), bar(2, 1.5, 3), bar(3, 3, 4.5), bar(4, 4.5, 6)];
    expect(chordLabels(notes, bars, 0, false)).toEqual([
      { start: 0, name: 'G/D' },
      { start: 4.5, name: 'C' },
    ]);
  });

  it('times a label at the first note of its window', () => {
    const notes = at(0.25, 48, 52, 55);
    expect(chordLabels(notes, [bar(1, 0, 1.5)], 0, false)).toEqual([{ start: 0.25, name: 'C' }]);
  });

  it('follows the transposition and its spelling', () => {
    const notes = at(0, 48, 52, 55);
    expect(chordLabels(notes, [bar(1, 0, 1.5)], 2, false)).toEqual([{ start: 0, name: 'D' }]);
    expect(chordLabels(notes, [bar(1, 0, 1.5)], 10, true)).toEqual([{ start: 0, name: 'B♭' }]);
    expect(chordLabels(notes, [bar(1, 0, 1.5)], 1, false)).toEqual([{ start: 0, name: 'C♯' }]);
    expect(chordLabels(notes, [bar(1, 0, 1.5)], 1, true)).toEqual([{ start: 0, name: 'D♭' }]);
  });

  it('puts a note that starts on a bar line in the bar it begins', () => {
    const notes = [...at(0, 48, 52, 55), ...at(1.5, 55, 59, 62)];
    expect(chordLabels(notes, [bar(1, 0, 1.5), bar(2, 1.5, 3)], 0, false)).toEqual([
      { start: 0, name: 'C' },
      { start: 1.5, name: 'G' },
    ]);
  });

  it('gives nothing for no notes or no bars', () => {
    expect(chordLabels([], [bar(1, 0, 1.5)], 0, false)).toEqual([]);
    expect(chordLabels(at(0, 48, 52, 55), [], 0, false)).toEqual([]);
  });
});
