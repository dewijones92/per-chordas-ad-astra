import type { PracticeSession } from '@pcaa/shared';
import { describe, expect, it } from 'vitest';
import {
  bestBpmByDay,
  localDay,
  streakDays,
  totalMinutesSince,
  totalsByDay,
  weekStart,
} from '../src/practice/stats.ts';
import {
  elapsedMs,
  formatDuration,
  formatMinutes,
  idleTimer,
  pauseTimer,
  startTimer,
} from '../src/practice/timer.ts';

const session = (
  startedAt: string,
  durationSec: number,
  bpm: number | null = null,
): PracticeSession =>
  ({ id: startedAt, pieceId: 'p', startedAt, durationSec, bpm, note: '' }) as PracticeSession;

describe('practice timer', () => {
  it('accumulates time across pauses', () => {
    let t = startTimer(idleTimer(), 1000);
    expect(startTimer(t, 5000)).toBe(t);
    t = pauseTimer(t, 4000);
    expect(pauseTimer(t, 9000)).toBe(t);
    expect(elapsedMs(t, 99_999)).toBe(3000);
    t = startTimer(t, 10_000);
    expect(t.startedAt).toBe(1000);
    expect(elapsedMs(t, 12_000)).toBe(5000);
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('0:00');
    expect([20, 600, 3600, 3900].map(formatMinutes)).toEqual([
      '1 min',
      '10 min',
      '1 h',
      '1 h 5 min',
    ]);
  });
});

describe('practice stats', () => {
  const sessions = [
    session('2026-10-05T09:00:00', 600, 80),
    session('2026-10-05T18:00:00', 300, 92),
    session('2026-10-06T09:00:00', 1200, null),
    session('2026-10-07T09:00:00', 120, 95),
  ];

  it('totals by local day', () => {
    expect(totalsByDay(sessions)).toEqual([
      { day: '2026-10-05', minutes: 15, sessions: 2 },
      { day: '2026-10-06', minutes: 20, sessions: 1 },
      { day: '2026-10-07', minutes: 2, sessions: 1 },
    ]);
    expect(totalMinutesSince(sessions, '2026-10-06')).toBe(22);
  });

  it('tracks the best clean tempo per day, skipping sessions with none', () => {
    expect(bestBpmByDay(sessions)).toEqual([
      { day: '2026-10-05', bpm: 92 },
      { day: '2026-10-07', bpm: 95 },
    ]);
  });

  it('counts a streak of consecutive days, forgiving today until it is over', () => {
    expect(streakDays(sessions, '2026-10-07')).toBe(3);
    expect(streakDays(sessions, '2026-10-08')).toBe(3);
    expect(streakDays(sessions, '2026-10-10')).toBe(0);
  });

  it('starts weeks on Monday', () => {
    expect(weekStart('2026-10-07T12:00:00')).toBe('2026-10-05');
    expect(localDay('2026-10-05T23:30:00')).toBe('2026-10-05');
  });
});
