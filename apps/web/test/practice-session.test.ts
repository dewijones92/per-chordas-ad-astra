import { describe, expect, it } from 'vitest';
import { LOG_IDLE_MS, LOG_MIN_MS, PlayAlongLog } from '../src/music/practice-session.ts';

const target = { pieceId: 'gran-vals', name: 'Gran Vals', baseBpm: 190 };
const T0 = Date.parse('2026-10-24T10:00:00.000Z');

describe('PlayAlongLog', () => {
  it('logs only the time actually played, with the loops and the top speed', () => {
    const log = new PlayAlongLog();
    log.play(T0, 0.6);
    log.noteLoop('bars 12–16');
    log.noteSpeed(0.75);
    log.pause(T0 + 50_000);
    log.play(T0 + 200_000, 0.75);
    log.noteLoop('bars 12–16');
    log.pause(T0 + 230_000);
    expect(log.played(T0 + 999_999)).toBe(80_000);
    expect(log.take(T0 + 240_000, target)).toEqual({
      pieceId: 'gran-vals',
      startedAt: '2026-10-24T10:00:00.000Z',
      durationSec: 80,
      bpm: 143,
      note: 'Play-along: Gran Vals, looped bars 12–16, up to 75% speed',
    });
    expect(log.take(T0 + 300_000, target)).toBeNull();
  });

  it('is due after two minutes paused, once a minute has been played', () => {
    const log = new PlayAlongLog();
    log.play(T0, 1);
    expect(log.due(T0 + LOG_MIN_MS + LOG_IDLE_MS)).toBe(false);
    log.pause(T0 + LOG_MIN_MS);
    expect(log.due(T0 + LOG_MIN_MS + LOG_IDLE_MS - 1)).toBe(false);
    expect(log.due(T0 + LOG_MIN_MS + LOG_IDLE_MS)).toBe(true);
  });

  it('does not log under a minute, and resets either way', () => {
    const log = new PlayAlongLog();
    log.play(T0, 1);
    log.pause(T0 + 59_000);
    expect(log.take(T0 + 60_000, target)).toBeNull();
    expect(log.played(T0 + 60_000)).toBe(0);
  });

  it('leaves the tempo out when the file has none or it is out of range', () => {
    const log = new PlayAlongLog();
    log.play(T0, 0.25);
    log.pause(T0 + 70_000);
    expect(log.take(T0 + 70_000, { ...target, baseBpm: 60 })?.bpm).toBeNull();
    log.play(T0, 1);
    log.pause(T0 + 70_000);
    expect(log.take(T0 + 70_000, { ...target, baseBpm: null })?.bpm).toBeNull();
  });
});
