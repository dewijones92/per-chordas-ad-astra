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

describe('opened stamps', () => {
  it('merge newest-wins per piece and default to empty for older state', () => {
    const a = ResumeState.parse({ opened: { x: { at: 10 }, y: { at: 50 } } });
    const b = ResumeState.parse({ opened: { x: { at: 30 } } });
    expect(mergeResume(a, b).opened).toEqual({ x: { at: 30 }, y: { at: 50 } });
    expect(ResumeState.parse({ lastPath: null }).opened).toEqual({});
  });
});

describe('view preferences', () => {
  it('merge zoom per score and view mode and library sort newest-wins', () => {
    const a = ResumeState.parse({
      zoom: { 'a/a.pdf': { value: 1.4, at: 10 } },
      viewMode: { mode: 'width', at: 10 },
      librarySort: { sort: 'added', reversed: false, at: 30 },
    });
    const b = ResumeState.parse({
      zoom: { 'a/a.pdf': { value: 0.8, at: 20 }, 'b/b.pdf': { value: 2, at: 5 } },
      viewMode: { mode: 'spread', at: 20 },
    });
    const merged = mergeResume(a, b);
    expect(merged.zoom).toEqual({
      'a/a.pdf': { value: 0.8, at: 20 },
      'b/b.pdf': { value: 2, at: 5 },
    });
    expect(merged.viewMode).toEqual({ mode: 'spread', at: 20 });
    expect(merged.librarySort).toEqual({ sort: 'added', reversed: false, at: 30 });
    expect(mergeResume(b, a)).toEqual(merged);
  });

  it('rejects an unknown view mode or sort', () => {
    expect(() => ResumeState.parse({ viewMode: { mode: 'huge', at: 1 } })).toThrow();
    expect(() =>
      ResumeState.parse({ librarySort: { sort: 'colour', reversed: false, at: 1 } }),
    ).toThrow();
  });
});
