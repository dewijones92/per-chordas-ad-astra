import { makeMusicXml, PIANO_WALTZ } from '@pcaa/fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/client.ts';
import { learnKeyShift, startInLearnKey } from '../src/music/learn-key.ts';

vi.mock('../src/api/client.ts', () => ({
  api: { getPiece: vi.fn(), patchPiece: vi.fn() },
}));

describe('starting a piece in C major or A minor', () => {
  it('moves a major key to C and a minor key to A, by the nearest way', () => {
    expect(learnKeyShift({ fifths: 1, minor: false })).toBe(5);
    expect(learnKeyShift({ fifths: -3, minor: false })).toBe(-3);
    expect(learnKeyShift({ fifths: 2, minor: false })).toBe(-2);
    expect(learnKeyShift({ fifths: -5, minor: true })).toBe(-1);
    expect(learnKeyShift({ fifths: 1, minor: true })).toBe(5);
    expect(learnKeyShift({ fifths: -1, minor: true })).toBe(-5);
  });

  it('leaves C major and A minor alone, and never moves more than six semitones', () => {
    expect(learnKeyShift({ fifths: 0, minor: false })).toBe(0);
    expect(learnKeyShift({ fifths: 0, minor: true })).toBe(0);
    for (let fifths = -7; fifths <= 7; fifths++) {
      for (const minor of [false, true]) {
        const shift = learnKeyShift({ fifths, minor });
        expect(Math.abs(shift)).toBeLessThanOrEqual(6);
        const tonic = (((fifths * 7 + (minor ? 9 : 0)) % 12) + 12) % 12;
        expect((((tonic + shift) % 12) + 12) % 12).toBe(minor ? 9 : 0);
      }
    }
  });
});

describe('starting a piece in C major', () => {
  beforeEach(() => {
    vi.mocked(api.getPiece).mockReset();
    vi.mocked(api.patchPiece).mockReset();
    vi.mocked(api.getPiece).mockResolvedValue({
      music: [{ file: 'waltz.musicxml', name: 'Waltz', transpose: 0 }],
    } as never);
  });

  it('changes one file by name and never sends the other files, which could overwrite a newer change', async () => {
    const bytes = new TextEncoder().encode(makeMusicXml({ ...PIANO_WALTZ, fifths: 2 }));
    const shift = await startInLearnKey('etude', 'waltz.musicxml', bytes);
    expect(shift).toBe(-2);
    expect(api.getPiece).not.toHaveBeenCalled();
    expect(api.patchPiece).toHaveBeenCalledExactlyOnceWith('etude', {
      transposeFile: { file: 'waltz.musicxml', transpose: -2 },
    });
  });

  it('does nothing for a piece already in C major', async () => {
    const bytes = new TextEncoder().encode(makeMusicXml({ ...PIANO_WALTZ, fifths: 0 }));
    expect(await startInLearnKey('etude', 'waltz.musicxml', bytes)).toBe(0);
    expect(api.patchPiece).not.toHaveBeenCalled();
  });
});
