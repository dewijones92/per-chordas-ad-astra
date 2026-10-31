import { describe, expect, it } from 'vitest';
import { assignHands, type Hand } from '../src/music/hands.ts';
import type { PerfNote } from '../src/music/performance.ts';
import { keyUpAt, STRIKE_SECONDS } from '../src/music/falling.ts';

const note = (pitch: number, start: number, end: number, staff = 0): PerfNote => ({
  pitch,
  start,
  end,
  staff,
  velocity: 80,
  bar: 0,
  grace: false,
});

function crossings(
  notes: readonly PerfNote[],
  hands: Map<PerfNote, Hand>,
  keyUp: (n: PerfNote) => number = (n) => n.end,
): string[] {
  const found: string[] = [];
  for (const at of new Set(notes.map((n) => n.start))) {
    const sounding = notes.filter((n) => n.start <= at + 1e-6 && keyUp(n) > at + 0.01);
    const left = sounding.filter((n) => hands.get(n) === 'left').map((n) => n.pitch);
    const right = sounding.filter((n) => hands.get(n) === 'right').map((n) => n.pitch);
    if (left.length > 0 && right.length > 0 && Math.max(...left) >= Math.min(...right))
      found.push(`${String(at)}: left ${left.join(',')} right ${right.join(',')}`);
  }
  return found;
}

describe('hand split', () => {
  it('splits Gran Vals bar 17 so no hand sits inside the other', () => {
    const c3 = note(48, 0, 0.5, 1);
    const g3 = note(55, 0, 1.5, 0);
    const g4 = note(67, 0, 1.5, 0);
    const chord1 = [note(60, 0.5, 1, 1), note(64, 0.5, 1, 1)];
    const chord2 = [note(60, 1, 1.5, 1), note(64, 1, 1.5, 1)];
    const notes = [c3, g3, g4, ...chord1, ...chord2];
    const hands = assignHands(notes);
    expect([c3, g3].map((n) => hands.get(n))).toEqual(['left', 'left']);
    expect([g4, ...chord1, ...chord2].map((n) => hands.get(n))).toEqual(
      Array<Hand>(5).fill('right'),
    );
    expect(crossings(notes, hands)).toEqual([]);
  });

  it('gives a high melody alone to the right hand and a low bass alone to the left', () => {
    const melody = [72, 74, 76].map((p, i) => note(p, i, i + 1));
    const bass = [36, 38, 40].map((p, i) => note(p, 10 + i, 11 + i));
    const hands = assignHands([...melody, ...bass]);
    expect(melody.map((n) => hands.get(n))).toEqual(['right', 'right', 'right']);
    expect(bass.map((n) => hands.get(n))).toEqual(['left', 'left', 'left']);
  });

  it('never crosses the hands, and keeps each hand within an octave where it can, on guitar-like texture', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const notes: PerfNote[] = [];
    for (let beat = 0; beat < 300; beat++) {
      const bass = 40 + Math.floor(random() * 12);
      if (beat % 3 === 0) notes.push(note(bass, beat, beat + 3));
      const count = 1 + Math.floor(random() * 3);
      const top = 60 + Math.floor(random() * 14);
      for (let k = 0; k < count; k++)
        notes.push(note(top - k * 4, beat, beat + 1 + (k === 0 ? 2 : 0)));
    }
    const hands = assignHands(notes);
    expect(hands.size).toBe(notes.length);
    expect(crossings(notes, hands)).toEqual([]);
  });

  it('with ringing tails, lets go of a key after the strike, so held notes stop boxing a hand in', () => {
    const long = note(60, 0, 3);
    const short = note(60, 0, 0.1);
    expect(keyUpAt(long, false)).toBe(3);
    expect(keyUpAt(long, true)).toBe(STRIKE_SECONDS);
    expect(keyUpAt(short, true)).toBe(0.1);
    const outer = [note(55, 0, 3), note(67, 0, 3)];
    const inner = [note(60, 1, 2), note(64, 1, 2)];
    const notes = [...outer, ...inner];
    const keyUp = (n: PerfNote) => keyUpAt(n, true);
    const hands = assignHands(notes, keyUp);
    expect(crossings(notes, hands, keyUp)).toEqual([]);
    expect(crossings(notes, assignHands(notes))).toEqual([]);
  });

  it('keeps a comfortable chord in one hand instead of splitting it between the hands', () => {
    const chords = [0, 0.5, 1].flatMap((t) => [60, 63, 67].map((p) => note(p, t, t + 0.5)));
    const hands = assignHands(chords);
    expect(new Set(chords.map((n) => hands.get(n)))).toEqual(new Set(['right']));
    const withBass = [note(36, 0, 1.5), ...chords];
    const split = assignHands(withBass);
    expect(split.get(withBass[0]!)).toBe('left');
    expect(new Set(chords.map((n) => split.get(n)))).toEqual(new Set(['right']));
  });
});
