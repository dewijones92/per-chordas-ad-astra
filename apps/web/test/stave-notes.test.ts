import { describe, expect, it } from 'vitest';
import { TPQ, noteKey, type ScoreMeasure, type ScoreNote } from '../src/music/model.ts';
import type { NotationNoteSpan } from '../src/music/notation-protocol.ts';
import { matchStaveNotes } from '../src/music/stave-notes.ts';

const measures: ScoreMeasure[] = [0, 1].map((index) => ({
  index,
  number: index + 1,
  tick: index * 3 * TPQ,
  ticks: 3 * TPQ,
  startRepeat: false,
  endRepeat: 0,
  markers: [],
  jump: null,
  sectionEnd: false,
  beat: TPQ,
}));

function note(staff: number, measure: number, rel: number, pitch: number, grace = false) {
  return {
    staff,
    measure,
    pitch,
    tick: (measures[measure]?.tick ?? 0) + rel,
    ticks: TPQ,
    tieForward: false,
    grace,
  } satisfies ScoreNote;
}

const span = (id: string, on: number, pitch: number): NotationNoteSpan => ({
  id,
  on,
  off: on + 1,
  pitch,
});

describe('matching drawn stave notes to written notes', () => {
  const notes = [
    note(0, 0, 0, 71),
    note(1, 0, 0, 43),
    note(1, 0, 0, 59),
    note(0, 1, TPQ, 67),
    note(0, 1, TPQ, 74, true),
  ];
  const starts = [0, 3];

  it('finds each note by its bar, its place in the bar and its pitch, chords included', () => {
    const matched = matchStaveNotes(
      [span('a', 0, 71), span('b', 0, 43), span('c', 0, 59), span('d', 4, 67)],
      starts,
      measures,
      notes,
      0,
    );
    expect(matched.byId.get('a')).toBe(notes[0]);
    expect(matched.byId.get('b')).toBe(notes[1]);
    expect(matched.byId.get('c')).toBe(notes[2]);
    expect(matched.byId.get('d')).toBe(notes[3]);
    expect(matched.idsOf.get(noteKey(notes[3] as ScoreNote))).toEqual(['d']);
  });

  it('matches the written pitch whatever the stave is transposed to', () => {
    const matched = matchStaveNotes(
      [span('a', 0, 73), span('d', 4, 69)],
      starts,
      measures,
      notes,
      2,
    );
    expect(matched.byId.get('a')).toBe(notes[0]);
    expect(matched.byId.get('d')).toBe(notes[3]);
  });

  it('leaves out a drawn note that matches no written note, and never matches a grace note by its pitch', () => {
    const matched = matchStaveNotes(
      [span('x', 0, 72), span('g', 4, 74), span('late', 5, 67)],
      starts,
      measures,
      notes,
      0,
    );
    expect(matched.byId.size).toBe(0);
  });

  it('gives two drawn unison notes their own written notes when both are on the page', () => {
    const doubled = [note(0, 0, 0, 60), note(1, 0, 0, 60)];
    const matched = matchStaveNotes(
      [span('u', 0, 60), span('v', 0, 60)],
      starts,
      measures,
      doubled,
      0,
    );
    expect(matched.byId.get('u')).toBe(doubled[0]);
    expect(matched.byId.get('v')).toBe(doubled[1]);
  });

  it('uses the bar starts the stave reports, so a pickup bar does not shift later notes', () => {
    const matched = matchStaveNotes([span('d', 11, 67)], [0, 10], measures, notes, 0);
    expect(matched.byId.get('d')).toBe(notes[3]);
  });
});
