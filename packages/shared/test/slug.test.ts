import { describe, expect, it } from 'vitest';
import { safeFileName, slugify, uniqueSlug } from '../src/slug.ts';
import { Piece, PiecePatch } from '../src/schemas.ts';

describe('slugs and file names', () => {
  it('slugifies accents, symbols and long titles', () => {
    expect(slugify('Étude No. 1 — “Lágrima”')).toBe('etude-no-1-lagrima');
    expect(slugify('!!!')).toBe('');
    expect(slugify('a'.repeat(70)).length).toBe(60);
  });

  it('makes slugs unique and never empty', () => {
    expect(uniqueSlug('Tune', new Set(['tune', 'tune-2']))).toBe('tune-3');
    expect(uniqueSlug('???', new Set())).toBe('piece');
  });

  it('keeps the extension, lower-cases it and avoids collisions', () => {
    expect(safeFileName('My Score.PDF', new Set())).toBe('my-score.pdf');
    expect(safeFileName('a.pdf', new Set(['a.pdf']))).toBe('a-2.pdf');
    expect(safeFileName('.mp3', new Set())).toBe('file.mp3');
    expect(() => safeFileName('noextension', new Set())).toThrow();
    expect(() => safeFileName('evil.exe', new Set())).toThrow();
  });
});

describe('schemas', () => {
  it('fills piece defaults but leaves a patch without them', () => {
    const p = Piece.parse({
      id: 'x',
      title: 'X',
      createdAt: '2026-10-07T10:00:00.000Z',
      updatedAt: '2026-10-07T10:00:00.000Z',
    });
    expect(p).toMatchObject({ tags: [], scores: [], targetBpm: null });
    expect(PiecePatch.parse({ bookmarks: [] })).toEqual({ bookmarks: [] });
    expect(() => PiecePatch.parse({ id: 'sneaky' })).toThrow();
  });
});
