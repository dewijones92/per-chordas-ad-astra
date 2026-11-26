import { expect, it, vi } from 'vitest';
import { RhythmSession, rhythmTargets } from '../src/music/rhythm-session.ts';
import type { PerfNote } from '../src/music/performance.ts';
const note = (pitch: number, start: number): PerfNote => ({
  pitch,
  start,
  end: start + 0.5,
  bar: 0,
  velocity: 90,
  staff: 0,
  grace: false,
});
it('grades a transposed chord once per pitch and keeps each source note', () => {
  const a = note(60, 1),
    b = note(60, 1.005),
    c = note(64, 1),
    ignored = note(67, 1);
  const targets = rhythmTargets([a, b, c, ignored], (n) => n !== ignored, 12);
  expect(targets.map((t) => t.pitches)).toEqual([[72, 76]]);
  const s = new RhythmSession();
  s.setTargets(targets, 0);
  expect(s.press(72, 1.04, 0.5, 0)).toBe('perfect');
  expect(s.press(76, 1.09, 0.5, 10)).toBe('late');
  expect(s.press(76, 1.09, 0.5, 11)).toBe('wrong');
  expect(s.view().noteHits).toEqual(
    new Map([
      [a, 'perfect'],
      [b, 'perfect'],
      [c, 'late'],
    ]),
  );
  expect(s.view().stats).toEqual({
    notes: 2,
    perfect: 1,
    good: 1,
    wrong: 1,
    missed: 0,
    streak: 0,
    bestStreak: 2,
    accuracy: 2 / 3,
  });
  expect(s.activePops(610).map((p) => p.grade)).toEqual(['late', 'wrong']);
  expect(s.activePops(612)).toEqual([]);
});

it('selects the closest repeated pitch, expires once, and seeks without grading skipped bars', () => {
  const a = note(60, 1),
    b = note(60, 1.14),
    c = note(64, 2),
    d = note(70, 0);
  const s = new RhythmSession();
  s.setTargets(
    rhythmTargets([a, b, c, d], () => true, 0),
    1,
  );
  const listener = vi.fn();
  const unsubscribe = s.subscribe(listener);
  expect(s.advance(1.01, 1, 0)).toBe(false);
  expect(listener).not.toHaveBeenCalled();
  expect(s.press(60, 1.1, 1, 50)).toBe('perfect');
  expect(s.view().noteHits.get(b)).toBe('perfect');
  expect(s.advance(1.19, 1, 100)).toBe(true);
  expect(s.advance(1.2, 1, 101)).toBe(false);
  expect(s.view().noteHits.get(a)).toBe('missed');
  s.finish(1.3, 1, 200);
  expect(s.view().finished).toBe(true);
  expect(s.view().stats.missed).toBe(2);
  s.jumpTo(1.1405);
  expect([...s.view().noteHits.keys()]).toEqual([a]);
  expect(s.press(60, 1.04, 1, 201)).toBe('early');
  unsubscribe();
  const count = listener.mock.calls.length;
  s.reset();
  expect(listener).toHaveBeenCalledTimes(count);
  expect(s.view()).toMatchObject({
    finished: false,
    lastGrade: null,
    stats: { notes: 0, missed: 0, accuracy: 0 },
  });
  expect(s.view().noteHits.size).toBe(0);
  expect(s.activePops(201)).toEqual([]);
});
