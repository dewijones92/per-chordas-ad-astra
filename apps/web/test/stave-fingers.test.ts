import {
  GUITAR_STYLE_WALTZ,
  PIANO_WALTZ,
  makeMscx,
  makeMusicXml,
  type FixtureScore,
} from '@pcaa/fixtures';
import { describe, expect, it } from 'vitest';
import { transposeMusicXml } from '../src/music/export.ts';
import { grandStaff, scoreHands } from '../src/music/grand-staff.ts';
import { assignHands } from '../src/music/hands.ts';
import { parseScoreText } from '../src/music/load.ts';
import { buildPerformance } from '../src/music/performance.ts';
import { fingeredMusicXml, withUserFingers } from '../src/music/stave-fingers.ts';
import { toMusicXml } from '../src/music/to-musicxml.ts';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

function fingerings(doc: Document): string[] {
  return [...doc.querySelectorAll('note')]
    .filter((n) => n.querySelector('notations > technical > fingering'))
    .map((n) => {
      const pitch = n.querySelector('pitch');
      const name = `${pitch?.querySelector('step')?.textContent ?? ''}${pitch?.querySelector('octave')?.textContent ?? ''}`;
      return `${name}=${n.querySelector('notations > technical > fingering')?.textContent ?? ''}@${n.querySelector('staff')?.textContent ?? ''}`;
    });
}

function mscxXml(score: FixtureScore, user: Map<string, string>): Document {
  const model = withUserFingers(parseScoreText(makeMscx(score, '4.50')), user);
  if (!model.notation) throw new Error('no notation');
  return parse(toMusicXml(model, model.notation));
}

const WITH_FILE_FINGERS: FixtureScore = {
  title: 'Fingered',
  tempo: 100,
  time: [4, 4],
  fifths: 0,
  parts: [{ name: 'Piano', staves: 1 }],
  measures: [
    {
      staves: [
        [
          { pitches: [60], dur: 'quarter', fingers: ['1'] },
          { pitches: [64], dur: 'quarter', fingers: ['3'] },
          { pitches: [67], dur: 'half' },
        ],
      ],
    },
  ],
};

describe('your fingering on the stave, MuseScore source', () => {
  it('writes your finger on the note you fingered and nowhere else', () => {
    const doc = mscxXml(PIANO_WALTZ, new Map([['s0m0t0p71', '4']]));
    expect(fingerings(doc)).toEqual(['B4=4@1']);
  });

  it('replaces the finger the file gave that same note, and leaves the file other marks alone', () => {
    const doc = mscxXml(WITH_FILE_FINGERS, new Map([['s0m0t480p64', '2']]));
    expect(fingerings(doc)).toEqual(['C4=1@1', 'E4=2@1']);
    expect(doc.querySelectorAll('fingering')).toHaveLength(2);
  });

  it('changes nothing when you have fingered nothing', () => {
    const model = parseScoreText(makeMscx(WITH_FILE_FINGERS, '4.50'));
    expect(withUserFingers(model, new Map())).toBe(model);
  });

  it('puts the finger on the note in the hand it is redrawn in, keyed by where the file wrote it', () => {
    const score = parseScoreText(makeMscx(GUITAR_STYLE_WALTZ, '4.50'));
    const perf = buildPerformance(score);
    const fingered = withUserFingers(
      score,
      new Map([
        ['s1m0t0p48', '5'],
        ['s0m0t0p67', '1'],
      ]),
    );
    const grand = grandStaff(fingered, scoreHands(fingered.notes, assignHands(perf.notes)));
    if (!grand.notation) throw new Error('no notation');
    expect(fingerings(parse(toMusicXml(grand, grand.notation))).sort()).toEqual([
      'C3=5@2',
      'G4=1@1',
    ]);
  });
});

describe('your fingering on the stave, MusicXML source', () => {
  const xml = makeMusicXml(PIANO_WALTZ);

  it('writes your finger on the note you fingered, in either hand, and nowhere else', () => {
    const doc = parse(
      fingeredMusicXml(
        xml,
        new Map([
          ['s0m0t0p71', '4'],
          ['s1m0t0p43', '5'],
        ]),
      ),
    );
    expect(fingerings(doc).sort()).toEqual(['B4=4@1', 'G2=5@2']);
  });

  it('keeps the file text untouched when nothing is fingered', () => {
    expect(fingeredMusicXml(xml, new Map())).toBe(xml);
  });

  it('replaces the file finger on the same note and keeps its other technical marks', () => {
    const source = makeMusicXml(WITH_FILE_FINGERS).replace(
      '<technical><fingering>3</fingering></technical>',
      '<technical><fingering>3</fingering><up-bow/></technical>',
    );
    expect(source).toContain('<up-bow/>');
    const doc = parse(fingeredMusicXml(source, new Map([['s0m0t480p64', '2']])));
    expect(fingerings(doc)).toEqual(['C4=1@1', 'E4=2@1']);
    expect(doc.querySelectorAll('up-bow')).toHaveLength(1);
  });

  it('keeps the finger on the same note after the stave is transposed', () => {
    const fingered = fingeredMusicXml(xml, new Map([['s0m0t0p71', '4']]));
    expect(fingerings(parse(transposeMusicXml(fingered, 2, 1)))).toEqual(['C5=4@1']);
  });

  it('puts the technical mark ahead of any lyric on the note', () => {
    const source = xml.replace(
      '<staff>1</staff></note>',
      '<staff>1</staff><lyric number="1"><text>la</text></lyric></note>',
    );
    expect(source).toContain('<lyric');
    const doc = parse(fingeredMusicXml(source, new Map([['s0m0t0p71', '4']])));
    const note = [...doc.querySelectorAll('note')].find((n) => n.querySelector('fingering'));
    const order = [...(note?.children ?? [])].map((c) => c.tagName);
    expect(order.indexOf('notations')).toBeLessThan(order.indexOf('lyric'));
  });
});
