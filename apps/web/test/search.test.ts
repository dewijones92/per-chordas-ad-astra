import type { Piece } from '@pcaa/shared';
import { describe, expect, it } from 'vitest';
import { allTags, filterPieces } from '../src/library/search.ts';

const piece = (id: string, title: string, artist: string, tags: string[], notes = ''): Piece =>
  ({
    id,
    title,
    artist,
    tags,
    notes,
    targetBpm: null,
    scores: [],
    tracks: [],
    bookmarks: [],
    createdAt: '',
    updatedAt: '',
  }) as unknown as Piece;

const pieces = [
  piece('blackbird', 'Blackbird', 'The Beatles', ['fingerstyle', 'learning']),
  piece('romanza', 'Spanish Romance', 'Anon.', ['classical', 'fingerstyle']),
  piece('spider', 'Spider exercise', '', ['warm-up'], 'chromatic 1-2-3-4'),
];

describe('library search', () => {
  it('lists every tag once, sorted', () => {
    expect(allTags(pieces)).toEqual(['classical', 'fingerstyle', 'learning', 'warm-up']);
  });

  it('matches prefixes and small typos, title first', () => {
    expect(filterPieces(pieces, { query: 'black', tags: [] }).map((p) => p.id)).toEqual([
      'blackbird',
    ]);
    expect(filterPieces(pieces, { query: 'romanse', tags: [] }).map((p) => p.id)).toEqual([
      'romanza',
    ]);
    expect(filterPieces(pieces, { query: 'beatles', tags: [] }).map((p) => p.id)).toEqual([
      'blackbird',
    ]);
    expect(filterPieces(pieces, { query: 'chromatic', tags: [] }).map((p) => p.id)).toEqual([
      'spider',
    ]);
  });

  it('requires every selected tag', () => {
    expect(filterPieces(pieces, { query: '', tags: ['fingerstyle'] })).toHaveLength(2);
    expect(
      filterPieces(pieces, { query: '', tags: ['fingerstyle', 'classical'] }).map((p) => p.id),
    ).toEqual(['romanza']);
  });

  it('restricts to a setlist in the setlist’s order', () => {
    expect(
      filterPieces(pieces, { query: '', tags: [], pieceIds: ['spider', 'blackbird'] }).map(
        (p) => p.id,
      ),
    ).toEqual(['spider', 'blackbird']);
  });
});
