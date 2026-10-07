import { afterEach, describe, expect, it } from 'vitest';
import {
  emptyResume,
  parseResume,
  readResume,
  scoreKey,
  shouldResumeTo,
  updateResume,
} from '../src/resume/resume.ts';

describe('resume store', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips where you were', () => {
    updateResume((s) => ({
      ...s,
      lastPath: '/piece/romanza',
      scores: { [scoreKey('romanza', 'a.pdf')]: { page: 3, y: 120 } },
    }));
    updateResume((s) => ({ ...s, pieceScore: { romanza: 'a.pdf' } }));
    expect(readResume()).toMatchObject({
      lastPath: '/piece/romanza',
      scores: { 'romanza/a.pdf': { page: 3, y: 120 } },
      pieceScore: { romanza: 'a.pdf' },
    });
  });

  it('survives missing, corrupt or wrongly shaped data', () => {
    expect(parseResume(null)).toEqual(emptyResume());
    expect(parseResume('{oops')).toEqual(emptyResume());
    expect(parseResume('[1,2]')).toEqual(emptyResume());
    expect(parseResume('{"lastPath":5,"scores":[]}')).toEqual(emptyResume());
  });

  it('only resumes from the front page, and only to a known kind of place', () => {
    const at = (lastPath: string | null) => ({ ...emptyResume(), lastPath });
    expect(shouldResumeTo('/', at('/piece/romanza'))).toBe('/piece/romanza');
    expect(shouldResumeTo('/', at('/log'))).toBe('/log');
    expect(shouldResumeTo('/log', at('/piece/romanza'))).toBeNull();
    expect(shouldResumeTo('/', at('/'))).toBeNull();
    expect(shouldResumeTo('/', at(null))).toBeNull();
    expect(shouldResumeTo('/', at('https://evil.example/'))).toBeNull();
    expect(shouldResumeTo('/', at('/piece/../../x'))).toBeNull();
  });
});
