import { clampBpm, defaultSettings, type MetronomeSettings } from './scheduler.ts';

const KEY = 'pcaa.metronome.v1';

export function loadSettings(): MetronomeSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<MetronomeSettings>;
    const base = defaultSettings();
    return {
      ...base,
      ...parsed,
      bpm: clampBpm(typeof parsed.bpm === 'number' ? parsed.bpm : base.bpm),
      trainer: { ...base.trainer, ...parsed.trainer },
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: MetronomeSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}
