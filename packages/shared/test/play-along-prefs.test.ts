import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAY_ALONG, PlayAlongPrefs } from '../src/prefs.ts';

describe('play-along preferences', () => {
  const older = {
    speed: 1,
    loop: null,
    hidden: [],
    muted: [1],
    full: false,
    position: 4,
  };

  it('read from before chord names as off, keeping what they held', () => {
    const parsed = PlayAlongPrefs.parse(older);
    expect(parsed.chords).toBe(false);
    expect(parsed.muted).toEqual([1]);
  });

  it('keep chord names on when they were switched on', () => {
    expect(PlayAlongPrefs.parse({ ...older, chords: true }).chords).toBe(true);
  });

  it('read from before the hands as showing them, and keep them off when switched off', () => {
    expect(PlayAlongPrefs.parse(older).hands).toBe(true);
    expect(PlayAlongPrefs.parse({ ...older, hands: false }).hands).toBe(false);
  });

  it('have the same defaults as an empty parse of the older shape', () => {
    expect(PlayAlongPrefs.parse({ ...older, muted: [], position: 0 })).toEqual(DEFAULT_PLAY_ALONG);
  });
});
