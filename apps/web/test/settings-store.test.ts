import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/metronome/scheduler.ts';
import { loadSettings, reconcile, saveSettings } from '../src/metronome/settings-store.ts';

const iso = (ms: number) => new Date(ms).toISOString();

describe('metronome settings store', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips stamped settings through localStorage', () => {
    const settings = { ...defaultSettings(), bpm: 132, beatsPerBar: 3 };
    saveSettings({ settings, at: 1234 });
    expect(loadSettings()).toEqual({ settings, at: 1234 });
  });

  it('reads the old unstamped key as never synced', () => {
    localStorage.setItem('pcaa.metronome.v1', JSON.stringify({ ...defaultSettings(), bpm: 101 }));
    expect(loadSettings()).toEqual({ settings: { ...defaultSettings(), bpm: 101 }, at: 0 });
  });

  it('falls back to defaults for missing or corrupt data, and clamps tempo', () => {
    expect(loadSettings()).toEqual({ settings: defaultSettings(), at: 0 });
    localStorage.setItem('pcaa.metronome.v2', '{not json');
    expect(loadSettings().settings).toEqual(defaultSettings());
    localStorage.setItem(
      'pcaa.metronome.v2',
      JSON.stringify({ settings: { bpm: 9999, trainer: { enabled: true } }, at: 5 }),
    );
    const loaded = loadSettings();
    expect(loaded.settings.bpm).toBe(400);
    expect(loaded.settings.trainer).toMatchObject({ enabled: true, stepBpm: 5 });
    expect(loaded.at).toBe(5);
    localStorage.setItem('pcaa.metronome.v2', JSON.stringify({ settings: { bpm: 'fast' } }));
    expect(loadSettings()).toEqual({ settings: defaultSettings(), at: 0 });
  });
});

describe('reconcile with the data repo', () => {
  const fast = { ...defaultSettings(), bpm: 140 };
  const slow = { ...defaultSettings(), bpm: 60 };

  it('does nothing when neither side has ever been changed', () => {
    expect(reconcile({ settings: defaultSettings(), at: 0 }, null, 99).kind).toBe('none');
  });

  it('pushes this browser’s settings when the repo has none, stamping old ones now', () => {
    expect(reconcile({ settings: fast, at: 0 }, null, 99)).toEqual({
      kind: 'push',
      save: { settings: fast, at: 99 },
    });
    expect(reconcile({ settings: fast, at: 50 }, null, 99)).toEqual({
      kind: 'push',
      save: { settings: fast, at: 50 },
    });
  });

  it('adopts newer settings from the repo, including over an unstamped browser', () => {
    expect(
      reconcile({ settings: fast, at: 0 }, { metronome: slow, updatedAt: iso(1000) }, 99),
    ).toEqual({ kind: 'adopt', stamped: { settings: slow, at: 1000 } });
  });

  it('pushes a newer local change, and does nothing when both agree', () => {
    expect(
      reconcile({ settings: fast, at: 2000 }, { metronome: slow, updatedAt: iso(1000) }, 99),
    ).toEqual({ kind: 'push', save: { settings: fast, at: 2000 } });
    expect(
      reconcile({ settings: slow, at: 2000 }, { metronome: slow, updatedAt: iso(1000) }, 99).kind,
    ).toBe('none');
    expect(
      reconcile({ settings: slow, at: 1000 }, { metronome: slow, updatedAt: iso(1000) }, 99).kind,
    ).toBe('none');
  });
});
