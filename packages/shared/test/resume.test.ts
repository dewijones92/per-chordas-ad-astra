import { describe, expect, it } from 'vitest';
import { emptyResume, mergeResume, ResumeState } from '../src/resume.ts';

describe('mergeResume', () => {
  const laptop = ResumeState.parse({
    lastPath: { path: '/piece/a', at: 100 },
    scores: { 'a/a.pdf': { page: 2, y: 10, at: 100 }, 'b/b.pdf': { page: 5, y: 0, at: 300 } },
    timers: { a: { accumulatedMs: 60_000, startedAt: 1, at: 100 } },
  });
  const phone = ResumeState.parse({
    lastPath: { path: '/piece/b', at: 200 },
    scores: { 'a/a.pdf': { page: 4, y: 0, at: 250 }, 'b/b.pdf': { page: 1, y: 0, at: 150 } },
  });

  it('keeps the newest entry for every key from either device', () => {
    const merged = mergeResume(laptop, phone);
    expect(merged.lastPath?.path).toBe('/piece/b');
    expect(merged.scores['a/a.pdf']?.page).toBe(4);
    expect(merged.scores['b/b.pdf']?.page).toBe(5);
    expect(merged.timers['a']?.accumulatedMs).toBe(60_000);
  });

  it('is symmetric and has the empty state as identity', () => {
    expect(mergeResume(laptop, phone)).toEqual(mergeResume(phone, laptop));
    expect(mergeResume(laptop, emptyResume())).toEqual(laptop);
    expect(mergeResume(emptyResume(), laptop)).toEqual(laptop);
  });

  it('fills defaults when parsing partial data', () => {
    expect(ResumeState.parse({})).toEqual(emptyResume());
    expect(() => ResumeState.parse({ lastPath: { path: 5, at: 1 } })).toThrow();
  });
});
