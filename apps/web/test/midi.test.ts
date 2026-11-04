import {
  GUITAR_STYLE_WALTZ,
  makeMidi,
  makeMscx,
  makeMusicXml,
  PIANO_WALTZ,
  type FixtureScore,
} from '@pcaa/fixtures';
import { describe, expect, it } from 'vitest';
import { performanceToMidi } from '../src/music/export.ts';
import { transposeFifths } from '../src/music/keys.ts';
import { checkFile } from '../src/music/file-check.ts';
import { isMidi } from '@pcaa/shared';
import { loadScore, readScore } from '../src/music/load.ts';
import { readMidi } from '../src/music/midi.ts';
import { TPQ } from '../src/music/model.ts';
import { buildPerformance } from '../src/music/performance.ts';

const enc = (s: string) => new TextEncoder().encode(s);

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  let rest = n >> 7;
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return out;
}

const END = [0x00, 0xff, 0x2f, 0x00];
const nameOf = (text: string) => [0x00, 0xff, 0x03, text.length, ...enc(text)];
const tempoOf = (bpm: number) => {
  const us = Math.round(60_000_000 / bpm);
  return [0x00, 0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
};
const timeOf = (n: number, d: number) => [0x00, 0xff, 0x58, 0x04, n, Math.log2(d), 24, 8];
const keyOf = (fifths: number, minor: boolean) => [
  0x00,
  0xff,
  0x59,
  0x02,
  fifths & 0xff,
  minor ? 1 : 0,
];

function mtrk(body: number[]): number[] {
  const n = body.length;
  return [
    ...enc('MTrk'),
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
    ...body,
  ];
}

function smf(format: number, division: number, tracks: number[][]): Uint8Array {
  return new Uint8Array([
    ...enc('MThd'),
    0,
    0,
    0,
    6,
    0,
    format,
    0,
    tracks.length,
    (division >> 8) & 0xff,
    division & 0xff,
    ...tracks.flatMap((t) => mtrk(t)),
  ]);
}

const DIV = 96;
const SCALE = TPQ / DIV;

const noteOn = (delta: number, ch: number, pitch: number, vel = 80) => [
  ...vlq(delta),
  0x90 | ch,
  pitch,
  vel,
];
const noteOff = (delta: number, ch: number, pitch: number) => [...vlq(delta), 0x80 | ch, pitch, 64];

describe('isMidi', () => {
  it('recognises the MThd header and nothing else', () => {
    expect(isMidi(smf(1, DIV, [END]))).toBe(true);
    expect(isMidi(enc('<?xml version="1.0"?>'))).toBe(false);
    expect(isMidi(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
    expect(isMidi(new Uint8Array())).toBe(false);
  });
});

describe('MIDI reader: bytes', () => {
  it('reads running status and treats note-on with velocity 0 as note-off', () => {
    const track = [
      ...nameOf('Lead'),
      0x00,
      0x90,
      60,
      80,
      0x60,
      62,
      90,
      0x60,
      60,
      0,
      0x60,
      62,
      0,
      ...END,
    ];
    const score = readMidi(smf(0, DIV, [track]));
    expect(score.format).toBe('midi');
    expect(score.notes.map((n) => [n.pitch, n.tick, n.ticks])).toEqual([
      [60, 0, 192 * SCALE],
      [62, 96 * SCALE, 192 * SCALE],
    ]);
    expect(score.notes.map((n) => n.velocity)).toEqual([80, 90]);
  });

  it('pairs overlapping notes of one pitch first in, first out', () => {
    const track = [
      ...noteOn(0, 0, 60, 70),
      ...noteOn(48, 0, 60, 90),
      ...noteOff(48, 0, 60),
      ...noteOff(48, 0, 60),
      ...END,
    ];
    const score = readMidi(smf(0, DIV, [track]));
    expect(score.notes.map((n) => [n.tick, n.ticks, n.velocity])).toEqual([
      [0, 96 * SCALE, 70],
      [48 * SCALE, 96 * SCALE, 90],
    ]);
  });

  it('gives a note that is never switched off the rest of the track', () => {
    const track = [...noteOn(0, 0, 60), 0x83, 0x00, 0xff, 0x2f, 0x00];
    const score = readMidi(smf(0, DIV, [track]));
    expect(score.notes.map((n) => n.ticks)).toEqual([384 * SCALE]);
  });

  it('ignores a note-off that has no note-on', () => {
    const track = [...noteOff(0, 0, 60), ...noteOn(0, 0, 62), ...noteOff(96, 0, 62), ...END];
    expect(readMidi(smf(0, DIV, [track])).notes.map((n) => n.pitch)).toEqual([62]);
  });

  it('skips system exclusive messages, other meta events and controllers', () => {
    const track = [
      0x00,
      0xf0,
      0x05,
      0x7e,
      0x7f,
      0x09,
      0x01,
      0xf7,
      0x00,
      0xff,
      0x01,
      0x03,
      ...enc('hey'),
      0x00,
      0xb0,
      7,
      100,
      0x00,
      0xe0,
      0,
      64,
      0x00,
      0xd0,
      30,
      ...noteOn(0, 0, 64),
      ...noteOff(96, 0, 64),
      ...END,
    ];
    expect(readMidi(smf(0, DIV, [track])).notes.map((n) => n.pitch)).toEqual([64]);
  });

  it('splits a format 0 file by channel and leaves the percussion channel out', () => {
    const track = [
      ...noteOn(0, 0, 72),
      ...noteOn(0, 1, 48),
      ...noteOn(0, 9, 36),
      ...noteOff(96, 0, 72),
      ...noteOff(0, 1, 48),
      ...noteOff(0, 9, 36),
      ...END,
    ];
    const score = readMidi(smf(0, DIV, [track]));
    expect(score.notes).toHaveLength(2);
    expect(score.parts).toHaveLength(1);
    expect(score.parts[0]?.staves).toEqual([0, 1]);
    expect(score.staves.map((s) => s.role)).toEqual(['right', 'left']);
    expect(score.notes.filter((n) => n.staff === 0).map((n) => n.pitch)).toEqual([72]);
  });

  it('puts the staff with the higher average pitch first, whatever order the tracks come in', () => {
    const low = [...nameOf('low'), ...noteOn(0, 0, 40), ...noteOff(96, 0, 40), ...END];
    const high = [...nameOf('high'), ...noteOn(0, 1, 80), ...noteOff(96, 1, 80), ...END];
    const score = readMidi(smf(1, DIV, [[...END], low, high]));
    expect(score.parts).toHaveLength(1);
    expect(score.notes.find((n) => n.pitch === 80)?.staff).toBe(0);
    expect(score.notes.find((n) => n.pitch === 40)?.staff).toBe(1);
    expect(score.staves.map((s) => s.name)).toEqual(['Piano RH', 'Piano LH']);
  });

  it('makes one part per staff when there are not exactly two', () => {
    const one = [...nameOf('Solo'), ...noteOn(0, 0, 60), ...noteOff(96, 0, 60), ...END];
    const solo = readMidi(smf(1, DIV, [one]));
    expect(solo.parts.map((p) => p.name)).toEqual(['Solo']);
    expect(solo.staves.map((s) => s.role)).toEqual(['single']);

    const three = readMidi(
      smf(1, DIV, [
        [...noteOn(0, 0, 60), ...noteOff(96, 0, 60), ...END],
        [...noteOn(0, 1, 62), ...noteOff(96, 1, 62), ...END],
        [...noteOn(0, 2, 64), ...noteOff(96, 2, 64), ...END],
      ]),
    );
    expect(three.parts).toHaveLength(3);
    expect(three.staves.map((s) => s.name)).toEqual(['Piano 1', 'Piano 2', 'Piano 3']);
  });

  it('builds bars from the time signature, 4/4 until one is given', () => {
    const conductor = [...timeOf(3, 4), ...END];
    const notes = [...noteOn(0, 0, 60), ...noteOff(96 * 9, 0, 60), ...END];
    const waltz = readMidi(smf(1, DIV, [conductor, notes]));
    expect(waltz.measures.map((m) => m.ticks)).toEqual([3 * TPQ, 3 * TPQ, 3 * TPQ]);
    expect(waltz.measures.map((m) => m.number)).toEqual([1, 2, 3]);
    expect(waltz.measures.every((m) => m.beat === TPQ)).toBe(true);

    const plain = readMidi(smf(0, DIV, [notes]));
    expect(plain.measures.map((m) => m.ticks)).toEqual([4 * TPQ, 4 * TPQ, 4 * TPQ]);
    expect(plain.measures.at(-1)?.beat).toBe(TPQ);
  });

  it('follows a time signature change at a bar line and uses dotted beats in 6/8', () => {
    const conductor = [...timeOf(4, 4), 0x83, 0x00, 0xff, 0x58, 0x04, 6, 3, 24, 8, ...END];
    const notes = [...noteOn(0, 0, 60), ...noteOff(96 * 8, 0, 60), ...END];
    const score = readMidi(smf(1, DIV, [conductor, notes]));
    expect(score.measures.map((m) => m.ticks)).toEqual([4 * TPQ, 3 * TPQ, 3 * TPQ]);
    expect(score.measures[1]?.beat).toBe(TPQ * 1.5);
  });

  it('reads tempo, key and the title from a conductor track, ignoring "Track 0"', () => {
    const conductor = [...nameOf('Moonlight'), ...tempoOf(90), ...keyOf(-4, true), ...END];
    const notes = [...noteOn(0, 0, 60), ...noteOff(96, 0, 60), ...END];
    const score = readMidi(smf(1, DIV, [conductor, notes]));
    expect(score.title).toBe('Moonlight');
    expect(score.tempos).toEqual([{ tick: 0, bpm: 90 }]);
    expect(score.keys).toEqual([{ tick: 0, fifths: -4, minor: true }]);
    expect(score.notation).toBeNull();

    const placeholder = readMidi(smf(1, DIV, [[...nameOf('Track 0'), ...END], notes]));
    expect(placeholder.title).toBe('');
  });

  it('warns that a file with no tempo plays at 120', () => {
    const notes = [...noteOn(0, 0, 60), ...noteOff(96, 0, 60), ...END];
    const score = readMidi(smf(0, DIV, [notes]));
    expect(score.tempos).toEqual([]);
    expect(score.warnings.join(' ')).toMatch(/120 bpm/);
    expect(buildPerformance(score).bars[0]?.end).toBeCloseTo(2, 5);
  });

  it('takes tempo changes from any track and lets a later one at the same tick win', () => {
    const a = [...tempoOf(100), 0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, ...END];
    const notes = [...noteOn(0, 0, 60), ...noteOff(96, 0, 60), ...END];
    expect(readMidi(smf(1, DIV, [a, notes])).tempos).toEqual([{ tick: 0, bpm: 120 }]);
  });

  it('reads the instrument from the program change', () => {
    const track = (program: number) => [
      0x00,
      0xc0,
      program,
      ...noteOn(0, 0, 60),
      ...noteOff(96, 0, 60),
      ...END,
    ];
    const instrumentOf = (program: number) =>
      readMidi(smf(0, DIV, [track(program)])).parts[0]?.instrument;
    expect(instrumentOf(0)).toBe('keyboard.piano');
    expect(instrumentOf(7)).toBe('keyboard.piano');
    expect(instrumentOf(24)).toBe('pluck.guitar');
    expect(instrumentOf(31)).toBe('pluck.guitar');
    expect(instrumentOf(40)).toBe('midi.program.40');
    expect(
      readMidi(smf(0, DIV, [[...noteOn(0, 0, 60), ...noteOff(96, 0, 60), ...END]])).parts[0]
        ?.instrument,
    ).toBe('');
  });

  it('gives the file check something sensible to say about a piano file and a guitar file', () => {
    const piano = readMidi(
      smf(1, DIV, [
        [0x00, 0xc0, 0, ...noteOn(0, 0, 72), ...noteOff(96, 0, 72), ...END],
        [0x00, 0xc1, 0, ...noteOn(0, 1, 40), ...noteOff(96, 1, 40), ...END],
      ]),
    );
    expect(checkFile(piano)).toMatchObject({
      declared: 'piano',
      layout: 'grand',
      verdict: 'piano',
    });
    const guitar = readMidi(
      smf(0, DIV, [[0x00, 0xc0, 25, ...noteOn(0, 0, 52), ...noteOff(96, 0, 52), ...END]]),
    );
    expect(checkFile(guitar)).toMatchObject({ declared: 'guitar', verdict: 'guitar' });
    const other = readMidi(
      smf(0, DIV, [[0x00, 0xc0, 40, ...noteOn(0, 0, 52), ...noteOff(96, 0, 52), ...END]]),
    );
    expect(checkFile(other).verdict).toBe('unclear');
  });

  it('scales any ticks-per-quarter division to the internal one', () => {
    const track = [...noteOn(0, 0, 60), ...noteOff(384, 0, 60), ...END];
    const score = readMidi(smf(0, 384, [track]));
    expect(score.notes[0]?.ticks).toBe(TPQ);
    expect(buildPerformance(score).notes[0]?.end).toBeCloseTo(0.5, 5);
  });

  it('refuses SMPTE time, format 2, a missing header and a division of zero, each with a reason', () => {
    const track = [...noteOn(0, 0, 60), ...noteOff(96, 0, 60), ...END];
    expect(() => readMidi(smf(0, 0xe728, [track]))).toThrow(/SMPTE/);
    expect(() => readMidi(smf(2, DIV, [track]))).toThrow(/format 2/i);
    expect(() => readMidi(smf(0, 0, [track]))).toThrow(/ticks per quarter/i);
    expect(() => readMidi(enc('not midi at all'))).toThrow(/not a MIDI file/i);
  });

  it('refuses a file cut short, saying where', () => {
    const whole = smf(1, DIV, [
      [...END],
      [
        ...noteOn(0, 0, 60),
        ...noteOff(96, 0, 60),
        ...noteOn(0, 0, 62),
        ...noteOff(96, 0, 62),
        ...END,
      ],
    ]);
    expect(() => readMidi(whole.subarray(0, whole.length - 6))).toThrow(/cut short/i);
    expect(() => readMidi(whole.subarray(0, 10))).toThrow(/cut short/i);
    const dangling = smf(0, DIV, [[0x00, 0x90, 60]]);
    expect(() => readMidi(dangling)).toThrow(/cut short/i);
  });

  it('refuses a file with no notes, and one where only percussion plays', () => {
    expect(() => readMidi(smf(0, DIV, [[...tempoOf(120), ...END]]))).toThrow(/no notes/i);
    const drums = [...noteOn(0, 9, 36), ...noteOff(96, 9, 36), ...END];
    expect(() => readMidi(smf(0, DIV, [drums]))).toThrow(/no notes/i);
  });

  it('refuses a data byte with no status to run on', () => {
    expect(() => readMidi(smf(0, DIV, [[0x00, 60, 80, ...END]]))).toThrow(/status/i);
  });
});

describe('MIDI loading', () => {
  it('goes through the one entry point, with no XML text', () => {
    const bytes = makeMidi(PIANO_WALTZ);
    const read = readScore(bytes);
    expect(read.text).toBeNull();
    expect(read.score.format).toBe('midi');
    expect(loadScore(bytes).title).toBe('Fixture Waltz');
    const xml = readScore(enc(makeMusicXml(PIANO_WALTZ)));
    expect(xml.score.format).toBe('musicxml');
    expect(xml.text).toContain('score-partwise');
  });
});

describe('MIDI reader: an independent writer as the oracle', () => {
  const straight: FixtureScore = {
    ...PIANO_WALTZ,
    title: 'Straight Waltz',
    measures: PIANO_WALTZ.measures.slice(0, 1).concat([
      {
        staves: [
          [
            { pitches: [67], dur: 'quarter' },
            { pitches: [69], dur: 'half' },
          ],
          [{ pitches: [50], dur: 'half', dots: 1 }],
        ],
        tempo: 90,
      },
    ]),
  };

  it('reads what the fixture writer wrote: two staves, 3/4, key, tempo, ties merged', () => {
    const score = loadScore(makeMidi(straight));
    expect(score.title).toBe('Straight Waltz');
    expect(score.parts).toHaveLength(1);
    expect(score.staves.map((s) => s.name)).toEqual(['Piano RH', 'Piano LH']);
    expect(score.measures.map((m) => m.ticks)).toEqual([3 * TPQ, 3 * TPQ]);
    expect(score.keys).toEqual([{ tick: 0, fifths: 1, minor: false }]);
    expect(score.tempos.map((t) => [t.tick, t.bpm])).toEqual([
      [0, 120],
      [3 * TPQ, 90],
    ]);
    const rh = score.notes.filter((n) => n.staff === 0).map((n) => [n.pitch, n.tick, n.ticks]);
    expect(rh).toEqual([
      [71, 0, TPQ],
      [67, TPQ, 3 * TPQ],
      [69, 4 * TPQ, 2 * TPQ],
    ]);
  });

  it('puts every note in the bar it starts in', () => {
    const score = loadScore(makeMidi(straight));
    for (const n of score.notes) {
      const m = score.measures[n.measure];
      expect(n.tick).toBeGreaterThanOrEqual(m?.tick ?? Infinity);
      expect(n.tick).toBeLessThan((m?.tick ?? 0) + (m?.ticks ?? 0));
    }
  });
});

describe('MIDI reader: the app writes it and reads it back', () => {
  const fixtures: [string, FixtureScore][] = [
    ['the piano waltz, with its repeats played out', PIANO_WALTZ],
    ['two single-staff parts', GUITAR_STYLE_WALTZ],
  ];

  it.each(fixtures)('%s', (_name, fixture) => {
    const before = buildPerformance(loadScore(enc(makeMscx(fixture, '3.02'))));
    const after = buildPerformance(loadScore(performanceToMidi(before, 0)));
    const shape = (p: typeof before) =>
      p.notes
        .map((n) => ({ pitch: n.pitch, start: n.start, end: n.end, velocity: n.velocity }))
        .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    const a = shape(before);
    const b = shape(after);
    expect(b).toHaveLength(a.length);
    a.forEach((n, i) => {
      expect(b[i]?.pitch).toBe(n.pitch);
      expect(Math.abs((b[i]?.start ?? 99) - n.start)).toBeLessThan(0.001);
      expect(Math.abs((b[i]?.end ?? 99) - n.end)).toBeLessThan(0.001);
      expect(b[i]?.velocity).toBe(n.velocity);
    });
    expect(after.bars).toHaveLength(before.bars.length);
    after.bars.forEach((bar, i) => {
      expect(bar.start).toBeCloseTo(before.bars[i]?.start ?? -1, 2);
    });
    expect(after.baseBpm).toBe(before.baseBpm);
    expect(after.keyFifths).toBe(before.keyFifths);
    expect(after.keyMinor).toBe(before.keyMinor);
    expect(after.staves).toHaveLength(2);
  });

  it('keeps a tempo other than 120 and the bars that go with it', () => {
    const slow: FixtureScore = { ...PIANO_WALTZ, tempo: 90 };
    const before = buildPerformance(loadScore(enc(makeMscx(slow, '3.02'))));
    const after = buildPerformance(loadScore(performanceToMidi(before, 0)));
    expect(after.baseBpm).toBe(90);
    expect(after.bars).toHaveLength(before.bars.length);
    after.bars.forEach((bar, i) => {
      expect(Math.abs(bar.start - (before.bars[i]?.start ?? 99))).toBeLessThan(0.002);
    });
  });

  it('keeps the transposition in the pitches and the key', () => {
    const before = buildPerformance(loadScore(enc(makeMscx(PIANO_WALTZ, '3.02'))));
    const after = buildPerformance(loadScore(performanceToMidi(before, 2)));
    expect(after.notes.map((n) => n.pitch).sort((x, y) => x - y)).toEqual(
      before.notes.map((n) => n.pitch + 2).sort((x, y) => x - y),
    );
    expect(after.keyFifths).toBe(transposeFifths(before.keyFifths, 2));
  });
});
