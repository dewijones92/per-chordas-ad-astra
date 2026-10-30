import { GUITAR_STYLE_WALTZ, makeMscx } from '@pcaa/fixtures';
import { describe, expect, it } from 'vitest';
import { grandStaff, scoreHands } from '../src/music/grand-staff.ts';
import { assignHands } from '../src/music/hands.ts';
import { parseScoreText } from '../src/music/load.ts';
import { buildPerformance } from '../src/music/performance.ts';
import { toMusicXml } from '../src/music/to-musicxml.ts';

function grandXml(): Document {
  const score = parseScoreText(makeMscx(GUITAR_STYLE_WALTZ, '4.50'));
  const perf = buildPerformance(score);
  const grand = grandStaff(score, scoreHands(score.notes, assignHands(perf.notes)));
  if (!grand.notation) throw new Error('no notation');
  return new DOMParser().parseFromString(toMusicXml(grand, grand.notation), 'application/xml');
}

describe('grand staff', () => {
  it('redraws a guitar-style score as one piano part, right hand on a treble staff and left on a bass staff', () => {
    const doc = grandXml();
    expect(doc.querySelectorAll('score-part')).toHaveLength(1);
    expect(doc.querySelector('staves')?.textContent).toBe('2');
    const clefs = [...doc.querySelectorAll('clef')].map(
      (c) =>
        `${c.getAttribute('number') ?? ''}:${c.querySelector('sign')?.textContent ?? ''}:${c.querySelector('clef-octave-change')?.textContent ?? '0'}`,
    );
    expect(clefs).toEqual(['1:G:0', '2:F:0']);
    const byStaff = (staff: string) =>
      [...doc.querySelectorAll('note')]
        .filter((n) => n.querySelector('staff')?.textContent === staff && n.querySelector('pitch'))
        .map(
          (n) =>
            `${n.querySelector('step')?.textContent ?? ''}${n.querySelector('octave')?.textContent ?? ''}`,
        )
        .sort();
    expect(byStaff('2')).toEqual(['C3', 'G3']);
    expect(byStaff('1')).toEqual(['C4', 'C4', 'E4', 'E4', 'G4']);
  });

  it('keeps a tied note in the hand that struck it', () => {
    const score = parseScoreText(
      makeMscx(
        {
          ...GUITAR_STYLE_WALTZ,
          measures: [
            {
              staves: [
                [{ pitches: [55], dur: 'half', dots: 1, tie: true }],
                [{ pitches: [36], dur: 'half', dots: 1 }],
              ],
            },
            {
              staves: [
                [{ pitches: [55], dur: 'half', dots: 1 }],
                [{ pitches: [36], dur: 'half', dots: 1 }],
              ],
            },
          ],
        },
        '4.50',
      ),
    );
    const hands = scoreHands(score.notes, assignHands(buildPerformance(score).notes));
    expect([...hands.entries()].filter(([k]) => k.includes(':55:')).map(([, h]) => h)).toEqual([
      'right',
      'right',
    ]);
  });
});
