import { makeMscx, makeMusicXml, PIANO_WALTZ, zipScore, type FixtureScore } from '@pcaa/fixtures';
import { describe, expect, it } from 'vitest';
import { loadScore, parseScoreText, unpackScore } from '../src/music/load.ts';
import { buildPerformance, countInFor } from '../src/music/performance.ts';
import { spell, toMusicXml } from '../src/music/to-musicxml.ts';
import { exportName, performanceToMidi, transposeMusicXml } from '../src/music/export.ts';

const enc = (s: string) => new TextEncoder().encode(s);

const FORMATS: [string, () => Uint8Array][] = [
  ['MuseScore 2.06 .mscx', () => enc(makeMscx(PIANO_WALTZ, '2.06'))],
  ['MuseScore 3.02 .mscx', () => enc(makeMscx(PIANO_WALTZ, '3.02'))],
  ['MuseScore 4.50 .mscx', () => enc(makeMscx(PIANO_WALTZ, '4.50'))],
  [
    'MuseScore 4.50 .mscz with extra files',
    () =>
      zipScore('waltz.mscx', makeMscx(PIANO_WALTZ, '4.50'), {
        'audiosettings.json': '{}',
        'viewsettings.json': '{}',
        'score_style.mss': '<museScore/>',
      }),
  ],
  ['MusicXML .musicxml', () => enc(makeMusicXml(PIANO_WALTZ))],
  ['MusicXML .mxl', () => zipScore('score.xml', makeMusicXml(PIANO_WALTZ))],
];

const round = (n: number) => Math.round(n * 10_000) / 10_000;

function summary(bytes: Uint8Array) {
  const perf = buildPerformance(loadScore(bytes));
  return {
    title: perf.title,
    staves: perf.staves.map((s) => `${s.name}:${s.role}`),
    bars: perf.bars.map((b) => b.number),
    key: perf.keyFifths,
    notes: perf.notes.map((n) => [n.staff, n.pitch, round(n.start), round(n.end)]),
  };
}

const T = 1 / 6;
const EXPECTED_NOTES = [
  [0, 67, 0.5, 2],
  [1, 43, 0, 0.5],
  [1, 59, 0.5, 1],
  [1, 62, 0.5, 1],
  [0, 71, 0, 0.5],
  [1, 59, 1, 1.5],
  [1, 62, 1, 1.5],
  [1, 50, 1.5, 3],
  [0, 69, 2, 3],
  [0, 67, 3.5, 4.5],
  [1, 43, 3, 3.5],
  [1, 59, 3.5, 4],
  [1, 62, 3.5, 4],
  [0, 71, 3, 3.5],
  [1, 59, 4, 4.5],
  [1, 62, 4, 4.5],
  [0, 74, 4.4375, 4.5],
  [0, 72, 4.5, 4.5 + T],
  [0, 71, 4.5 + T, 4.5 + 2 * T],
  [1, 55, 5, 6],
  [0, 69, 4.5 + 2 * T, 5],
  [0, 67, 5, 6],
].map(([s, p, a, b]) => [s, p, round(a ?? 0), round(b ?? 0)]);

describe('every supported format reads the same music', () => {
  it.each(FORMATS)('%s', (_name, bytes) => {
    const got = summary(bytes());
    expect(got.title).toBe('Fixture Waltz');
    expect(got.staves).toEqual(['Piano RH:right', 'Piano LH:left']);
    expect(got.bars).toEqual([1, 2, 1, 3]);
    expect(got.key).toBe(1);
    const sort = (list: (number | undefined)[][]) =>
      [...list].sort(
        (a, b) =>
          (a[2] ?? 0) - (b[2] ?? 0) || (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0),
      );
    expect(sort(got.notes)).toEqual(sort(EXPECTED_NOTES));
  });
});

describe('loading', () => {
  it('reads the root file named by the container, and falls back to the first score inside', () => {
    expect(unpackScore(zipScore('deep/x.mscx', '<museScore/>'))).toBe('<museScore/>');
    const bare = zipScore('a.mscx', '<museScore version="3.02"/>');
    expect(unpackScore(bare)).toContain('museScore');
  });

  it('strips a byte-order mark', () => {
    expect(unpackScore(enc('﻿<a/>'))).toBe('<a/>');
  });

  it('explains files it cannot read', () => {
    expect(() => parseScoreText('not xml at all')).toThrow(/Not valid XML/);
    expect(() => parseScoreText('<html/>')).toThrow(/Not a MuseScore or MusicXML file/);
    expect(() => parseScoreText('<score-timewise/>')).toThrow(/Timewise/);
    expect(() => parseScoreText('<museScore version="3.02"/>')).toThrow(/no score/);
    expect(() => loadScore(zipScore('notes.txt', 'hello'))).toThrow(/No score inside/);
  });
});

function simple(
  measures: FixtureScore['measures'],
  extra: Partial<FixtureScore> = {},
): FixtureScore {
  return {
    title: 'T',
    tempo: 60,
    time: [4, 4],
    fifths: 0,
    parts: [{ name: 'Guitar', staves: 1 }],
    measures,
    ...extra,
  };
}

const whole = (pitch: number) => [[{ pitches: [pitch], dur: 'whole' as const }]];

describe('MuseScore details', () => {
  it('skips linked tablature copies and percussion staves', () => {
    const xml = makeMscx(simple([{ staves: whole(60) }]), '3.02')
      .replace(
        '</Part>',
        '</Part><Part><Staff id="2"><StaffType group="tablature"/><linkedTo>1</linkedTo></Staff><trackName>Tab</trackName></Part><Part><Staff id="3"><StaffType group="percussion"/></Staff><trackName>Drums</trackName></Part>',
      )
      .replace(
        '</Score>',
        '<Staff id="2"><Measure><voice><Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord></voice></Measure></Staff><Staff id="3"><Measure><voice><Chord><durationType>whole</durationType><Note><pitch>38</pitch></Note></Chord></voice></Measure></Staff></Score>',
      );
    const score = parseScoreText(xml);
    expect(score.staves.map((s) => s.name)).toEqual(['Guitar']);
    expect(score.notes.map((n) => n.pitch)).toEqual([60]);
  });

  it('places a second voice with a location offset, and copies a repeated bar', () => {
    const xml = makeMscx(simple([{ staves: whole(60) }, { staves: [[]] }]), '3.02')
      .replace(
        '</voice></Measure><Measure>',
        '</voice><voice><location><fractions>1/2</fractions></location><Chord><durationType>half</durationType><Note><pitch>64</pitch></Note></Chord></voice></Measure><Measure>',
      )
      .replace(
        /<Measure><voice><\/voice><\/Measure>/,
        '<Measure><voice><RepeatMeasure><durationType>measure</durationType><duration>4/4</duration></RepeatMeasure></voice></Measure>',
      );
    const perf = buildPerformance(parseScoreText(xml));
    expect(perf.notes.map((n) => [n.pitch, n.start])).toEqual([
      [60, 0],
      [64, 2],
      [60, 4],
      [64, 6],
    ]);
  });

  it('applies dynamics as velocity and tempo changes mid-piece', () => {
    const xml = makeMscx(
      simple([{ staves: whole(60) }, { staves: whole(62), tempo: 120 }]),
      '3.02',
    ).replace('<Chord>', '<Dynamic><subtype>pp</subtype></Dynamic><Chord>');
    const perf = buildPerformance(parseScoreText(xml));
    expect(perf.notes.map((n) => [n.pitch, n.start, n.end, n.velocity])).toEqual([
      [60, 0, 4, 33],
      [62, 4, 6, 33],
    ]);
    expect(perf.duration).toBe(6);
  });

  it('numbers bars again after a section break and skips a pickup', () => {
    const xml = makeMscx(
      simple([{ staves: whole(60) }, { staves: whole(62) }, { staves: whole(64) }]),
      '3.02',
    )
      .replace('<Measure>', '<Measure len="1/4"><irregular>1</irregular>')
      .replace(/(<Measure>)(<voice>)/, '$1<LayoutBreak><subtype>section</subtype></LayoutBreak>$2');
    const score = parseScoreText(xml);
    expect(score.measures.map((m) => [m.number, m.sectionEnd])).toEqual([
      [1, false],
      [1, true],
      [1, false],
    ]);
  });

  it('names a nameless part and numbers parts with the same name', () => {
    const score = parseScoreText(
      makeMscx(
        {
          ...simple([
            { staves: [[{ pitches: [60], dur: 'whole' }], [{ pitches: [48], dur: 'whole' }]] },
          ]),
          parts: [
            { name: 'Voice', staves: 1 },
            { name: 'Voice', staves: 1 },
          ],
        },
        '2.06',
      ),
    );
    expect(score.staves.map((s) => s.name)).toEqual(['Voice 1', 'Voice 2']);
  });

  it('warns when there is no tempo', () => {
    const score = parseScoreText(
      makeMscx(simple([{ staves: whole(60) }]), '3.02').replace(/<Tempo>.*?<\/Tempo>/, ''),
    );
    expect(score.warnings).toContain('No tempo marking; playing at 120 bpm');
    expect(buildPerformance(score).duration).toBe(2);
  });
});

describe('MusicXML details', () => {
  it('sounds a transposing part at concert pitch and skips cue notes', () => {
    const xml = makeMusicXml(simple([{ staves: whole(64) }]))
      .replace(
        '<staves>1</staves>',
        '<staves>1</staves><transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>',
      )
      .replace(
        '</measure>',
        '<note><cue/><pitch><step>C</step><octave>5</octave></pitch><duration>24</duration></note></measure>',
      );
    expect(buildPerformance(parseScoreText(xml)).notes.map((n) => n.pitch)).toEqual([52]);
  });

  it('reads D.C. al Fine from sound attributes', () => {
    const xml = makeMusicXml(
      simple([
        { staves: whole(60) },
        { staves: whole(62), marker: 'fine' },
        { staves: whole(64), jump: { to: 'start', until: 'fine' } },
      ]),
    );
    expect(buildPerformance(parseScoreText(xml)).bars.map((b) => b.number)).toEqual([
      1, 2, 3, 1, 2,
    ]);
  });

  it('reads D.S. al Coda from sound attributes', () => {
    const xml = makeMusicXml(
      simple([
        { staves: whole(60) },
        { staves: whole(62), marker: 'segno' },
        { staves: whole(64), marker: 'coda' },
        { staves: whole(65), jump: { to: 'segno', until: 'coda' } },
        { staves: whole(67), marker: 'codab' },
      ]),
    );
    expect(buildPerformance(parseScoreText(xml)).bars.map((b) => b.number)).toEqual([
      1, 2, 3, 4, 2, 3, 5,
    ]);
  });

  it('falls back to the words when a D.C. has no sound attributes', () => {
    const xml = makeMusicXml(simple([{ staves: whole(60) }, { staves: whole(62) }])).replace(
      '</measure></part>',
      '<direction><direction-type><words>D.C.</words></direction-type></direction></measure></part>',
    );
    expect(buildPerformance(parseScoreText(xml)).bars.map((b) => b.number)).toEqual([1, 2, 1, 2]);
  });

  it('rejects a partwise file with no parts', () => {
    expect(() => parseScoreText('<score-partwise/>')).toThrow(/no parts/);
  });
});

describe('title and composer', () => {
  it('reads them from every encoding, and from a MuseScore title frame when the tags are empty', () => {
    const sources = [
      makeMscx(PIANO_WALTZ, '2.06'),
      makeMscx(PIANO_WALTZ, '3.02'),
      makeMscx(PIANO_WALTZ, '4.50'),
      makeMusicXml(PIANO_WALTZ),
    ];
    for (const source of sources) {
      const score = parseScoreText(source);
      expect([score.title, score.composer]).toEqual(['Fixture Waltz', 'Fixture Composer']);
    }
    const framed = makeMscx(PIANO_WALTZ, '3.02')
      .replace(
        /<metaTag name="(workTitle|composer)">[^<]*<\/metaTag>/g,
        '<metaTag name="$1"></metaTag>',
      )
      .replace(
        /<Staff id="1">(?=<Measure)/,
        '<Staff id="1"><VBox><Text><style>Title</style><text>Gran Vals</text></Text><Text><style>Composer</style><text><font size="10"/>Francisco Tárrega\nArranged by A. Friend</text></Text></VBox>',
      );
    const score = parseScoreText(framed);
    expect([score.title, score.composer]).toEqual(['Gran Vals', 'Francisco Tárrega']);
    const twoLineTitle = parseScoreText(
      framed.replace('<text>Gran Vals</text>', '<text>Gran\nVals</text>'),
    );
    expect(twoLineTitle.title).toBe('Gran Vals');
  });
});

describe('MuseScore to MusicXML for the notation view', () => {
  const versions = ['2.06', '3.02', '4.50'] as const;
  it.each(versions)('MuseScore %s round-trips to the same performance', (version) => {
    const score = parseScoreText(makeMscx(PIANO_WALTZ, version));
    if (!score.notation) throw new Error('no notation');
    const xml = toMusicXml(score, score.notation);
    const back = buildPerformance(parseScoreText(xml));
    const direct = buildPerformance(score);
    const shape = (p: typeof direct) => ({
      bars: p.bars.map((b) => b.number),
      key: p.keyFifths,
      notes: p.notes.map((n) => [n.staff, n.pitch, round(n.start), round(n.end)]),
    });
    expect(shape(back)).toEqual(shape(direct));
    expect(xml).toContain('<beam number="1">begin</beam>');
    expect(xml).toContain('<tuplet type="start"/>');
    expect(xml).toContain('<grace slash="yes"/>');
    expect(xml).toContain('<tied type="start"/>');
    expect(xml.match(/<slur type="start" number="1"\/>/g)).toHaveLength(1);
    expect(xml.match(/<slur type="stop" number="1"\/>/g)).toHaveLength(1);
    expect(xml).toContain('<ending number="1" type="start"/>');
    expect(xml).toContain('<repeat direction="backward" times="2"/>');
  });

  it('spells notes from MuseScore pitch classes, and sharps when there are none', () => {
    expect(spell(70, 12)).toEqual({ step: 'B', alter: -1, octave: 4 });
    expect(spell(70, 24)).toEqual({ step: 'A', alter: 1, octave: 4 });
    expect(spell(59, 7)).toEqual({ step: 'C', alter: -1, octave: 4 });
    expect(spell(60, 26)).toEqual({ step: 'B', alter: 1, octave: 3 });
    expect(spell(61, null)).toEqual({ step: 'C', alter: 1, octave: 4 });
  });
});

describe('local time signatures', () => {
  it('keeps the bar as long as the other staff and scales the stretched staff’s notes', () => {
    const xml = makeMscx(
      {
        title: 'Local',
        tempo: 60,
        time: [3, 4],
        fifths: 0,
        parts: [{ name: 'Harpsichord', staves: 2 }],
        measures: [
          {
            staves: [
              [
                { pitches: [72], dur: 'half', dots: 1 },
                { pitches: [74], dur: 'quarter', dots: 1 },
              ],
              [{ pitches: [48], dur: 'half', dots: 1 }],
            ],
          },
          {
            staves: [
              [
                { pitches: [76], dur: 'half', dots: 1 },
                { pitches: [77], dur: 'quarter', dots: 1 },
              ],
              [{ pitches: [50], dur: 'half', dots: 1 }],
            ],
          },
        ],
      },
      '3.02',
    ).replace(
      '<TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>',
      '<TimeSig><sigN>9</sigN><sigD>8</sigD><stretchN>3</stretchN><stretchD>2</stretchD></TimeSig>',
    );
    const perf = buildPerformance(parseScoreText(xml));
    expect(perf.bars.map((b) => [b.start, b.end])).toEqual([
      [0, 3],
      [3, 6],
    ]);
    expect(
      perf.notes.filter((n) => n.staff === 0).map((n) => [n.pitch, round(n.start), round(n.end)]),
    ).toEqual([
      [72, 0, 2],
      [74, 2, 3],
      [76, 3, 5],
      [77, 5, 6],
    ]);
  });
});

describe('clicks and count-in', () => {
  it('clicks every beat, accenting the first of each bar, and counts compound time in dotted beats', () => {
    const waltz = buildPerformance(parseScoreText(makeMscx(PIANO_WALTZ, '3.02')));
    expect(waltz.clicks.slice(0, 4).map((c) => [round(c.start), c.kind])).toEqual([
      [0, 'bar'],
      [0.5, 'beat'],
      [1, 'beat'],
      [1.5, 'bar'],
    ]);
    expect(waltz.clicks).toHaveLength(12);
    const jig = buildPerformance(
      parseScoreText(
        makeMscx(
          {
            ...PIANO_WALTZ,
            time: [6, 8],
            measures: [{ staves: [[{ pitches: [67], dur: 'half', dots: 1 }], []] }],
          },
          '3.02',
        ),
      ),
    );
    expect(jig.clicks.map((c) => [round(c.start), c.kind])).toEqual([
      [0, 'bar'],
      [0.75, 'beat'],
    ]);
  });

  it('counts in one bar at the playing speed, using the next full bar after a pickup', () => {
    const waltz = buildPerformance(parseScoreText(makeMscx(PIANO_WALTZ, '3.02')));
    expect(countInFor(waltz, 0, 1)).toEqual({ beats: 3, seconds: 0.5 });
    expect(countInFor(waltz, 0, 0.5)).toEqual({ beats: 3, seconds: 1 });
    const pickup = buildPerformance(
      parseScoreText(
        makeMscx(PIANO_WALTZ, '3.02').replace(
          '<Measure>',
          '<Measure len="1/4"><irregular>1</irregular>',
        ),
      ),
    );
    expect(countInFor(pickup, 0, 1)).toEqual({ beats: 3, seconds: 0.5 });
  });
});

describe('export transposed', () => {
  it('transposes MusicXML into the key we show, spelling notes for it', () => {
    const xml = makeMusicXml(PIANO_WALTZ);
    const up = transposeMusicXml(xml, 2, 1);
    const original = buildPerformance(parseScoreText(xml));
    const moved = buildPerformance(parseScoreText(up));
    expect(moved.keyFifths).toBe(3);
    expect(moved.notes.map((n) => [n.pitch, round(n.start)])).toEqual(
      original.notes.map((n) => [n.pitch + 2, round(n.start)]),
    );
    expect(up).toContain('<step>C</step><alter>1</alter><octave>5</octave>');
    const down = transposeMusicXml(xml, -1, 1);
    expect(buildPerformance(parseScoreText(down)).keyFifths).toBe(6);
    expect(down).toContain('<step>F</step><alter>1</alter><octave>4</octave>');
    expect(transposeMusicXml(xml, 0, 1)).toBe(xml);
  });

  it('moves every key change by the same interval and spells its notes in it', () => {
    const note = (step: string, alter: number, octave: number) =>
      `<note><pitch><step>${step}</step>${alter ? `<alter>${String(alter)}</alter>` : ''}<octave>${String(octave)}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>`;
    const xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>G</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note('C', 0, 4)}${note('E', 0, 4)}${note('G', 0, 4)}${note('C', 0, 5)}</measure><measure number="2"><attributes><key><fifths>-1</fifths></key></attributes>${note('F', 0, 4)}${note('A', 0, 4)}${note('B', -1, 4)}${note('C', 0, 5)}</measure><measure number="3"><attributes><key><fifths>6</fifths></key></attributes>${note('F', 1, 4)}${note('A', 1, 4)}${note('C', 1, 5)}${note('E', 1, 5)}</measure></part></score-partwise>`;
    const out = transposeMusicXml(xml, 1, 0);
    const bars = out
      .split('<measure')
      .slice(1)
      .map((m) => ({
        key: Number(/<fifths>(-?\d+)<\/fifths>/.exec(m)?.[1]),
        notes: [...m.matchAll(/<step>(\w)<\/step>(?:<alter>(-?\d)<\/alter>)?<octave>(\d)/g)].map(
          (x) => `${x[1] ?? ''}${x[2] === '1' ? '#' : x[2] === '-1' ? 'b' : ''}${x[3] ?? ''}`,
        ),
      }));
    expect(bars).toEqual([
      { key: -5, notes: ['Db4', 'F4', 'Ab4', 'Db5'] },
      { key: -6, notes: ['Gb4', 'Bb4', 'Cb5', 'Db5'] },
      { key: 1, notes: ['G4', 'B4', 'D5', 'F#5'] },
    ]);
    expect(buildPerformance(parseScoreText(out)).notes.map((n) => n.pitch)).toEqual(
      buildPerformance(parseScoreText(xml)).notes.map((n) => n.pitch + 1),
    );
  });

  it('writes a type-1 MIDI file with a track per staff and every note', () => {
    const perf = buildPerformance(parseScoreText(makeMscx(PIANO_WALTZ, '3.02')));
    const midi = performanceToMidi(perf, 2);
    const ascii = (from: number, to: number) => String.fromCharCode(...midi.slice(from, to));
    const byte = (at: number) => midi[at] ?? 0;
    expect(ascii(0, 4)).toBe('MThd');
    expect([byte(8), byte(9), byte(10), byte(11), byte(12) * 256 + byte(13)]).toEqual([
      0, 1, 0, 3, 480,
    ]);
    const tracks: { name: string; on: [number, number][]; off: number }[] = [];
    let at = 14;
    while (at < midi.length) {
      expect(ascii(at, at + 4)).toBe('MTrk');
      const end =
        at + 8 + ((byte(at + 4) << 24) | (byte(at + 5) << 16) | (byte(at + 6) << 8) | byte(at + 7));
      at += 8;
      let tick = 0;
      const track = { name: '', on: [] as [number, number][], off: 0 };
      const varLen = () => {
        let v = 0;
        for (;;) {
          const b = byte(at++);
          v = (v << 7) | (b & 0x7f);
          if (b < 0x80) return v;
        }
      };
      while (at < end) {
        tick += varLen();
        const status = byte(at++);
        if (status === 0xff) {
          const type = byte(at++);
          const len = varLen();
          if (type === 0x03) track.name = ascii(at, at + len);
          at += len;
        } else if ((status & 0xf0) === 0xc0) {
          at += 1;
        } else {
          expect(status & 0x0f).not.toBe(9);
          const pitch = byte(at++);
          const velocity = byte(at++);
          if ((status & 0xf0) === 0x90 && velocity > 0) track.on.push([tick, pitch]);
          else track.off += 1;
        }
      }
      tracks.push(track);
    }
    expect(tracks.map((t) => t.name)).toEqual(['Fixture Waltz', ...perf.staves.map((s) => s.name)]);
    perf.staves.forEach((staff, k) => {
      const expected = perf.notes
        .filter((n) => n.staff === staff.index)
        .map((n): [number, number] => [Math.round(n.start * 960), n.pitch + 2])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const got = [...(tracks[k + 1]?.on ?? [])].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      expect(got).toEqual(expected);
      expect(tracks[k + 1]?.off).toBe(expected.length);
    });
  });
});

describe('export file names', () => {
  it('names the export after the music and its transposition', () => {
    expect(exportName('Gran Vals.mscz', 2, 'musicxml')).toBe('Gran Vals (+2).musicxml');
    expect(exportName('Gran Vals.mscz', -3, 'mid')).toBe('Gran Vals (-3).mid');
    expect(exportName('Gran Vals.mscz', 0, 'mid')).toBe('Gran Vals.mid');
  });
});
