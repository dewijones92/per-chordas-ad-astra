import { describe, expect, it } from 'vitest';
import { soundingAt, visibleNotes, maxNoteLength, geometry } from '../src/music/falling.ts';
import { keyboardLayout, keyForPitch } from '../src/music/keyboard.ts';
import {
  fitRange,
  isBlackKey,
  majorKeyName,
  noteName,
  signedSemitones,
  transposeFifths,
} from '../src/music/keys.ts';
import type { Jump, ScoreMeasure, Volta } from '../src/music/model.ts';
import type { PerfNote } from '../src/music/performance.ts';
import { chooseSample, gainFor, sampleFile, SampleManifest } from '../src/music/samples.ts';
import { clampSpeed, START_LEAD_SECONDS, Transport } from '../src/music/transport.ts';
import { sectionsOf, unroll } from '../src/music/unroll.ts';

function bars(spec: string, jumps: Record<number, Jump> = {}): ScoreMeasure[] {
  return spec.split(' ').map((token, index) => ({
    index,
    number: index + 1,
    tick: index * 1920,
    ticks: 1920,
    startRepeat: token.startsWith('|:'),
    endRepeat: /:\|(\d)?/.exec(token) ? Number(/:\|(\d)/.exec(token)?.[1] ?? 2) : 0,
    markers: [...token.matchAll(/\[(\w+)\]/g)].map((m) => m[1] ?? ''),
    jump: jumps[index] ?? null,
    sectionEnd: token.endsWith('//'),
  }));
}

const played = (measures: ScoreMeasure[], voltas: Volta[] = []) =>
  unroll(measures, voltas)
    .order.map((i) => i + 1)
    .join(' ');

describe('unroll', () => {
  it('plays straight through without repeats', () => {
    expect(played(bars('a b c'))).toBe('1 2 3');
  });

  it('repeats from the start, or from a start repeat, as many times as marked', () => {
    expect(played(bars('a b:|'))).toBe('1 2 1 2');
    expect(played(bars('a |:b c:|3 d'))).toBe('1 2 3 2 3 2 3 4');
  });

  it('takes first and second endings', () => {
    expect(
      played(bars('|:a b c:| d e'), [
        { start: 2, end: 3, endings: [1] },
        { start: 3, end: 4, endings: [2] },
      ]),
    ).toBe('1 2 3 1 2 4 5');
  });

  it('plays D.C. al Fine and D.S. al Coda', () => {
    const dc = bars('a b[fine] c', {
      2: { jumpTo: 'start', playUntil: 'fine', continueAt: '', playRepeats: false },
    });
    expect(played(dc)).toBe('1 2 3 1 2');
    const ds = bars('a b[segno] c[coda] d e[codab]', {
      3: { jumpTo: 'segno', playUntil: 'coda', continueAt: 'codab', playRepeats: false },
    });
    expect(played(ds)).toBe('1 2 3 4 2 3 5');
  });

  it('takes a jump inside a repeat only on the last time through', () => {
    const m = bars('a[segno] |:b c:| d', {
      1: { jumpTo: 'segno', playUntil: 'end', continueAt: '', playRepeats: false },
    });
    expect(played(m)).toBe('1 2 3 2 1 2 3 4');
  });

  it('does not repeat again after a D.C. unless told to', () => {
    const plain = bars('|:a b:| c', {
      2: { jumpTo: 'start', playUntil: 'end', continueAt: '', playRepeats: false },
    });
    expect(played(plain)).toBe('1 2 1 2 3 1 2 3');
    const again = bars('|:a b:| c', {
      2: { jumpTo: 'start', playUntil: 'end', continueAt: '', playRepeats: true },
    });
    expect(played(again)).toBe('1 2 1 2 3 1 2 1 2 3');
  });

  it('treats each section on its own', () => {
    const m = bars('a b:|// c d:|');
    expect(sectionsOf(m)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(played(m)).toBe('1 2 1 2 3 4 3 4');
  });

  it('warns about a jump to a missing label and carries on', () => {
    const m = bars('a b', {
      1: { jumpTo: 'nowhere', playUntil: 'end', continueAt: '', playRepeats: false },
    });
    const result = unroll(m, []);
    expect(result.order).toEqual([0, 1]);
    expect(result.warnings[0]).toMatch(/no "nowhere"/);
  });

  it('stops a score whose repeats never end', () => {
    const m = bars('a:|9').map((bar) => ({ ...bar, endRepeat: 100_000 }));
    const result = unroll(m, []);
    expect(result.order.length).toBeLessThanOrEqual(20_002);
    expect(result.warnings[0]).toMatch(/never end/);
  });
});

const note = (pitch: number, start: number, end: number, staff = 0): PerfNote => ({
  pitch,
  start,
  end,
  staff,
  velocity: 80,
  bar: 0,
});

describe('Transport', () => {
  const notes = [note(60, 0, 1), note(62, 1, 2), note(64, 2, 3), note(65, 3, 4)];

  it('schedules notes in the look-ahead window at the right audio time', () => {
    const t = new Transport(notes, 4);
    t.play(10);
    const start = 10 + START_LEAD_SECONDS;
    expect(t.pump(10, 0.1, () => true).map((s) => [s.note.pitch, s.when])).toEqual([[60, start]]);
    expect(t.pump(10.1, 1.0, () => true).map((s) => s.note.pitch)).toEqual([62]);
    expect(t.songAt(start + 1.5)).toBeCloseTo(1.5);
  });

  it('halves the pace at half speed and keeps the place when the speed changes', () => {
    const t = new Transport(notes, 4);
    t.setSpeed(0.5, 0);
    t.play(0);
    const s = t.pump(0, 3, () => true);
    expect(s.map((x) => [x.note.pitch, x.when - START_LEAD_SECONDS, x.duration])).toEqual([
      [60, 0, 2],
      [62, 2, 2],
    ]);
    const before = t.songAt(2 + START_LEAD_SECONDS);
    t.setSpeed(1, 2 + START_LEAD_SECONDS);
    expect(t.songAt(2 + START_LEAD_SECONDS)).toBeCloseTo(before);
    expect(clampSpeed(9)).toBe(2);
    expect(clampSpeed(0)).toBe(0.25);
  });

  it('wraps a loop seamlessly and keeps going', () => {
    const t = new Transport(notes, 4);
    t.setLoop({ start: 1, end: 3 }, 0);
    t.play(0);
    const lead = START_LEAD_SECONDS;
    const s = t.pump(0, 4.5, () => true);
    expect(s.map((x) => [x.note.pitch, Number((x.when - lead).toFixed(3))])).toEqual([
      [62, 0],
      [64, 1],
      [62, 2],
      [64, 3],
      [62, 4],
    ]);
    expect(t.songAt(lead + 2.5)).toBeCloseTo(1.5);
    expect(t.finished(lead + 100)).toBe(false);
  });

  it('starts at the loop when playing from outside it, and seeks while paused', () => {
    const t = new Transport(notes, 4);
    t.seek(3.5, 0);
    expect(t.songAt(0)).toBe(3.5);
    t.setLoop({ start: 1, end: 2 }, 0);
    expect(t.songAt(0)).toBe(1);
    t.play(0);
    expect(t.pump(0, 0.5, () => true).map((x) => x.note.pitch)).toEqual([62]);
  });

  it('skips notes the filter leaves out, finishes at the end, and restarts from the top', () => {
    const t = new Transport(notes, 4);
    t.play(0);
    const s = t.pump(0, 5, (n) => n.pitch !== 62);
    expect(s.map((x) => x.note.pitch)).toEqual([60, 64, 65]);
    expect(t.finished(5)).toBe(true);
    t.pause(5);
    expect(t.songAt(5)).toBe(4);
    t.play(6);
    expect(t.songAt(6 + START_LEAD_SECONDS)).toBe(0);
  });

  it('does nothing when not playing', () => {
    const t = new Transport(notes, 4);
    expect(t.pump(0, 1, () => true)).toEqual([]);
    t.pause(0);
    expect(t.playing).toBe(false);
  });
});

describe('keys and names', () => {
  it('names notes and keys, and transposes key signatures', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C♯4');
    expect(noteName(61, true)).toBe('D♭4');
    expect(majorKeyName(0)).toBe('C');
    expect(majorKeyName(-3)).toBe('E♭');
    expect(majorKeyName(1)).toBe('G');
    expect(transposeFifths(1, 2)).toBe(3);
    expect(majorKeyName(transposeFifths(-3, -1))).toBe('D');
    expect(transposeFifths(0, 1)).toBe(-5);
    expect(signedSemitones(0)).toBe('written key');
    expect(signedSemitones(-1)).toBe('−1 semitone');
    expect(signedSemitones(3)).toBe('+3 semitones');
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
  });

  it('fits the keyboard to the music in whole octaves, at least three', () => {
    expect(fitRange(62, 67, false)).toEqual({ low: 48, high: 83 });
    expect(fitRange(40, 81, false)).toEqual({ low: 36, high: 83 });
    expect(fitRange(40, 81, true)).toEqual({ low: 21, high: 108 });
  });
});

describe('keyboard layout', () => {
  it('spaces white keys evenly and sits black keys on the boundaries', () => {
    const layout = keyboardLayout({ low: 60, high: 71 }, 700);
    expect(layout.whiteWidth).toBe(100);
    expect(layout.byPitch.get(60)).toMatchObject({ x: 0, width: 100, black: false });
    expect(layout.byPitch.get(62)?.x).toBe(100);
    expect(layout.byPitch.get(61)?.black).toBe(true);
    expect(layout.byPitch.get(61)?.x).toBeCloseTo(100 - 31);
    expect(keyForPitch(layout, 20, { low: 60, high: 71 })?.pitch).toBe(60);
    expect(keyForPitch(layout, 99, { low: 60, high: 71 })?.pitch).toBe(71);
  });
});

describe('piano samples', () => {
  const manifest = SampleManifest.parse({
    name: 'x',
    author: 'y',
    licence: 'z',
    pitches: [21, 24, 27, 60, 63],
    layers: [
      { name: 'p', velocity: 40 },
      { name: 'mf', velocity: 80 },
      { name: 'f', velocity: 115 },
    ],
    file: '{pitch}-{layer}.ogg',
  });

  it('picks the nearest sample, the nearest loudness, and the playback rate', () => {
    expect(chooseSample(manifest, 61, 80)).toEqual({ pitch: 60, layer: 'mf', rate: 2 ** (1 / 12) });
    expect(chooseSample(manifest, 62, 30).layer).toBe('p');
    expect(chooseSample(manifest, 62, 127).pitch).toBe(63);
    expect(sampleFile(manifest, 60, 'f')).toBe('60-f.ogg');
  });

  it('makes louder notes louder without silencing quiet ones', () => {
    expect(gainFor(1)).toBeGreaterThan(0.24);
    expect(gainFor(127)).toBe(1);
    expect(gainFor(40)).toBeLessThan(gainFor(100));
  });
});

describe('falling notes geometry', () => {
  const notes = [note(60, 0, 4), note(62, 1, 1.5), note(64, 2, 2.5), note(65, 6, 7)];

  it('finds the notes on screen, including long notes that started earlier', () => {
    const longest = maxNoteLength(notes);
    expect(longest).toBe(4);
    expect(visibleNotes(notes, 3, 6, longest).map((n) => n.pitch)).toEqual([60, 65]);
    expect(soundingAt(notes, 1.2, longest).map((n) => n.pitch)).toEqual([60, 62]);
  });

  it('keeps the keyboard a sensible share of the height', () => {
    const g = geometry({ width: 800, height: 600, range: { low: 48, high: 83 } });
    expect(g.keyboardHeight).toBe(120);
    expect(g.notesHeight).toBe(480);
    expect(g.pxPerSecond).toBe(160);
  });
});
