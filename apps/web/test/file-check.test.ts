import {
  GUITAR_STYLE_WALTZ,
  makeMscx,
  makeMusicXml,
  PIANO_WALTZ,
  type FixtureScore,
} from '@pcaa/fixtures';
import { describe, expect, it } from 'vitest';
import { checkFile, fingerKind } from '../src/music/file-check.ts';
import { parseScoreText } from '../src/music/load.ts';
import { toMusicXml } from '../src/music/to-musicxml.ts';

const fingered = (
  base: FixtureScore,
  instrument: string | undefined,
  fingers: (string | null)[],
  fingerStyle?: 'fingering' | 'lhGuitarFingering' | 'rhGuitarFingering' | 'stringNumber',
): FixtureScore => ({
  ...base,
  parts: base.parts.map((p) => ({ ...p, ...(instrument ? { instrument } : {}) })),
  measures: base.measures.map((m, mi) =>
    mi === 0
      ? {
          ...m,
          staves: m.staves.map((chords, si) =>
            si === 0
              ? chords.map((c, ci) =>
                  ci === 0 && c.pitches?.length
                    ? { ...c, fingers, ...(fingerStyle ? { fingerStyle } : {}) }
                    : c,
                )
              : chords,
          ),
        }
      : m,
  ),
});

const firstFingered = (xml: string) => {
  const score = parseScoreText(xml);
  return score.notes.filter((n) => n.finger).map((n) => n.finger);
};

describe('what kind a fingering mark is', () => {
  it('reads the style MuseScore saved, then the text', () => {
    expect(fingerKind('3', '', false)).toBe('piano');
    expect(fingerKind('5', 'fingering', false)).toBe('piano');
    expect(fingerKind('0', '', false)).toBe('guitarLeft');
    expect(fingerKind('2', 'lhGuitarFingering', false)).toBe('guitarLeft');
    expect(fingerKind('p', '', false)).toBe('guitarRight');
    expect(fingerKind('a', 'rhGuitarFingering', false)).toBe('guitarRight');
    expect(fingerKind('3', 'stringNumber', false)).toBe('string');
    expect(fingerKind('2', '', true)).toBe('guitarLeft');
    expect(fingerKind('', '', false)).toBeNull();
    expect(fingerKind('hello', '', false)).toBeNull();
  });
});

describe('fingering read from the file', () => {
  for (const version of ['2.06', '3.02', '4.50'] as const) {
    it(`keeps piano fingering on its note in MuseScore ${version}`, () => {
      const xml = makeMscx(fingered(PIANO_WALTZ, 'keyboard.piano', ['3']), version);
      expect(firstFingered(xml)).toEqual([{ text: '3', kind: 'piano' }]);
    });
  }

  it('keeps fingering, plucking and string marks from MusicXML', () => {
    expect(firstFingered(makeMusicXml(fingered(PIANO_WALTZ, 'keyboard.piano', ['2'])))).toEqual([
      { text: '2', kind: 'piano' },
    ]);
    expect(
      firstFingered(makeMusicXml(fingered(PIANO_WALTZ, undefined, ['i'], 'rhGuitarFingering'))),
    ).toEqual([{ text: 'i', kind: 'guitarRight' }]);
    expect(
      firstFingered(makeMusicXml(fingered(PIANO_WALTZ, undefined, ['4'], 'stringNumber'))),
    ).toEqual([{ text: '4', kind: 'string' }]);
  });

  it('calls a plain number on a guitar part a left-hand guitar finger', () => {
    const xml = makeMscx(fingered(PIANO_WALTZ, 'pluck.guitar.nylon-string', ['2']), '4.50');
    expect(firstFingered(xml)).toEqual([{ text: '2', kind: 'guitarLeft' }]);
  });

  it('writes MuseScore fingering into the MusicXML the stave is drawn from', () => {
    const score = parseScoreText(makeMscx(fingered(PIANO_WALTZ, 'keyboard.piano', ['3']), '4.50'));
    if (!score.notation) throw new Error('no notation');
    expect(toMusicXml(score, score.notation)).toContain(
      '<technical><fingering>3</fingering></technical>',
    );
  });
});

describe('the file check', () => {
  it('says a one-part, two-staff piano file with piano fingering is written for piano', () => {
    const check = checkFile(
      parseScoreText(makeMscx(fingered(PIANO_WALTZ, 'keyboard.piano', ['1']), '4.50')),
    );
    expect(check).toEqual({
      declared: 'piano',
      layout: 'grand',
      fingers: { piano: 1, guitarLeft: 0, guitarRight: 0, string: 0 },
      verdict: 'piano',
    });
  });

  it('flags a file that names piano but is laid out like guitar (the Gran Vals shape)', () => {
    const check = checkFile(
      parseScoreText(makeMscx(fingered(GUITAR_STYLE_WALTZ, 'keyboard.piano', []), '2.06')),
    );
    expect(check.declared).toBe('piano');
    expect(check.layout).toBe('single');
    expect(check.verdict).toBe('unclear');
  });

  it('calls a guitar part, a tab staff or guitar fingering guitar', () => {
    const named = checkFile(
      parseScoreText(makeMscx(fingered(PIANO_WALTZ, 'pluck.guitar.nylon-string', []), '4.50')),
    );
    expect(named.declared).toBe('guitar');
    expect(named.verdict).toBe('guitar');

    const tab: FixtureScore = {
      ...GUITAR_STYLE_WALTZ,
      parts: [
        { name: 'Classical', staves: 1, tab: true },
        { name: 'Classical 2', staves: 1 },
      ],
    };
    expect(checkFile(parseScoreText(makeMscx(tab, '4.50'))).layout).toBe('tab');
    expect(checkFile(parseScoreText(makeMscx(tab, '4.50'))).verdict).toBe('guitar');

    const plucked = checkFile(
      parseScoreText(makeMusicXml(fingered(PIANO_WALTZ, undefined, ['p'], 'rhGuitarFingering'))),
    );
    expect(plucked.fingers.guitarRight).toBe(1);
    expect(plucked.verdict).toBe('guitar');
  });

  it('falls back to the part names when the file names no instrument', () => {
    expect(checkFile(parseScoreText(makeMusicXml(PIANO_WALTZ))).declared).toBe('piano');
    const guitar: FixtureScore = { ...PIANO_WALTZ, parts: [{ name: 'Guitar', staves: 1 }] };
    expect(checkFile(parseScoreText(makeMusicXml(guitar))).declared).toBe('guitar');
    const flute: FixtureScore = { ...PIANO_WALTZ, parts: [{ name: 'Flute', staves: 2 }] };
    expect(checkFile(parseScoreText(makeMusicXml(flute))).declared).toBe('unknown');
  });
});
