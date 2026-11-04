import type { FileFingering, Fingering } from '@pcaa/shared';
import { describe, expect, it } from 'vitest';
import { FingerSaves } from '../src/music/finger-saves.ts';

const doc = (notes: FileFingering['notes']): Fingering => ({ files: { 'a.mscz': notes } });

describe('keeping the last confirmed fingering while saves are in flight', () => {
  it('shows what the server last confirmed when a save fails, not the number that was never saved', () => {
    const saves = new FingerSaves();
    const before = doc({ n1: '2' });
    saves.begin(before);
    expect(saves.failed()).toEqual(before);
  });

  it('ignores a reply that arrives after a newer one, so two quick saves never drop the second', () => {
    const saves = new FingerSaves();
    const first = saves.begin(doc({}));
    const second = saves.begin(doc({ n1: '1' }));
    expect(saves.succeeded(second, 'a.mscz', { n1: '1', n2: '2' })).toBeNull();
    expect(saves.succeeded(first, 'a.mscz', { n1: '1' })).toEqual(doc({ n1: '1', n2: '2' }));
  });

  it('leaves the screen alone while a newer save is still out, then shows the confirmed state', () => {
    const saves = new FingerSaves();
    const first = saves.begin(doc({}));
    const second = saves.begin(doc({ n1: '1' }));
    expect(saves.succeeded(first, 'a.mscz', { n1: '1' })).toBeNull();
    expect(saves.succeeded(second, 'a.mscz', { n1: '1', n2: '2' })).toEqual(
      doc({ n1: '1', n2: '2' }),
    );
  });

  it('keeps the earlier confirmed finger when the later save is the one that fails', () => {
    const saves = new FingerSaves();
    const first = saves.begin(doc({}));
    saves.begin(doc({ n1: '1' }));
    expect(saves.succeeded(first, 'a.mscz', { n1: '1' })).toBeNull();
    expect(saves.failed()).toEqual(doc({ n1: '1' }));
  });

  it('starts from the screen again once everything has settled', () => {
    const saves = new FingerSaves();
    const t = saves.begin(doc({}));
    expect(saves.succeeded(t, 'a.mscz', { n1: '3' })).toEqual(doc({ n1: '3' }));
    saves.begin(doc({ n1: '3' }));
    expect(saves.failed()).toEqual(doc({ n1: '3' }));
  });
});
