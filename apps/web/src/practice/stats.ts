import type { PracticeSession } from '@pcaa/shared';

export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekStart(iso: string): string {
  const d = new Date(iso);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return localDay(d.toISOString());
}

export interface DayTotal {
  day: string;
  minutes: number;
  sessions: number;
}

export function totalsByDay(sessions: readonly PracticeSession[]): DayTotal[] {
  const map = new Map<string, DayTotal>();
  for (const s of sessions) {
    const day = localDay(s.startedAt);
    const entry = map.get(day) ?? { day, minutes: 0, sessions: 0 };
    entry.minutes += s.durationSec / 60;
    entry.sessions += 1;
    map.set(day, entry);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function totalMinutesSince(sessions: readonly PracticeSession[], sinceDay: string): number {
  return sessions
    .filter((s) => localDay(s.startedAt) >= sinceDay)
    .reduce((sum, s) => sum + s.durationSec / 60, 0);
}

export interface BpmPoint {
  day: string;
  bpm: number;
}

export function bestBpmByDay(sessions: readonly PracticeSession[]): BpmPoint[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (s.bpm === null) continue;
    const day = localDay(s.startedAt);
    map.set(day, Math.max(map.get(day) ?? 0, s.bpm));
  }
  return [...map].map(([day, bpm]) => ({ day, bpm })).sort((a, b) => a.day.localeCompare(b.day));
}

export function streakDays(sessions: readonly PracticeSession[], today: string): number {
  const days = new Set(sessions.map((s) => localDay(s.startedAt)));
  let streak = 0;
  const cursor = new Date(`${today}T12:00:00`);
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (days.has(localDay(cursor.toISOString()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
