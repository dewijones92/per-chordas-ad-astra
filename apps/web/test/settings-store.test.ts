import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/metronome/scheduler.ts';
import { loadSettings, saveSettings } from '../src/metronome/settings-store.ts';

describe('metronome settings store', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips settings through localStorage', () => {
    const s = { ...defaultSettings(), bpm: 132, beatsPerBar: 3 };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });

  it('falls back to defaults for missing or corrupt data, and clamps tempo', () => {
    expect(loadSettings()).toEqual(defaultSettings());
    localStorage.setItem('pcaa.metronome.v1', '{not json');
    expect(loadSettings()).toEqual(defaultSettings());
    localStorage.setItem(
      'pcaa.metronome.v1',
      JSON.stringify({ bpm: 9999, trainer: { enabled: true } }),
    );
    const loaded = loadSettings();
    expect(loaded.bpm).toBe(400);
    expect(loaded.trainer).toMatchObject({ enabled: true, stepBpm: 5 });
    localStorage.setItem('pcaa.metronome.v1', JSON.stringify({ bpm: 'fast' }));
    expect(loadSettings().bpm).toBe(80);
  });
});
