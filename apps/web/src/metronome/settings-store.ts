import type { MetronomeSave, MetronomeSettings, SettingsFile } from '@pcaa/shared';
import { clampBpm, defaultSettings } from './scheduler.ts';

const KEY = 'pcaa.metronome.v2';
const LEGACY_KEY = 'pcaa.metronome.v1';

export interface StampedSettings {
  settings: MetronomeSettings;
  at: number;
}

function normalise(raw: unknown): MetronomeSettings {
  const base = defaultSettings();
  if (raw === null || typeof raw !== 'object') return base;
  const parsed = raw as Partial<MetronomeSettings>;
  return {
    ...base,
    ...parsed,
    bpm: clampBpm(typeof parsed.bpm === 'number' ? parsed.bpm : base.bpm),
    trainer: { ...base.trainer, ...parsed.trainer },
  };
}

function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function loadSettings(): StampedSettings {
  const stored = readKey(KEY);
  if (stored !== null && typeof stored === 'object' && 'settings' in stored) {
    const at = 'at' in stored && typeof stored.at === 'number' ? stored.at : 0;
    return { settings: normalise(stored.settings), at };
  }
  return { settings: normalise(readKey(LEGACY_KEY)), at: 0 };
}

export function saveSettings(stamped: StampedSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stamped));
  } catch {
    return;
  }
}

export type Reconciliation =
  | { kind: 'adopt'; stamped: StampedSettings }
  | { kind: 'push'; save: MetronomeSave }
  | { kind: 'none'; why: string };

const same = (a: MetronomeSettings, b: MetronomeSettings) =>
  JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));

export function reconcile(
  local: StampedSettings,
  remote: SettingsFile | null,
  now: number,
): Reconciliation {
  if (remote === null) {
    if (local.at === 0 && same(local.settings, defaultSettings())) {
      return { kind: 'none', why: 'nothing saved anywhere yet' };
    }
    return { kind: 'push', save: { settings: local.settings, at: local.at || now } };
  }
  const remoteAt = Date.parse(remote.updatedAt);
  if (remoteAt > local.at) {
    return { kind: 'adopt', stamped: { settings: normalise(remote.metronome), at: remoteAt } };
  }
  if (local.at > remoteAt && !same(local.settings, remote.metronome)) {
    return { kind: 'push', save: { settings: local.settings, at: local.at } };
  }
  return { kind: 'none', why: 'already in step' };
}
