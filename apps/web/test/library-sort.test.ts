import type { Piece, PracticeSession } from '@pcaa/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ago,
  buildStats,
  NEGLECT_CAP_DAYS,
  neglectWeight,
  NO_STATS,
  pickForMe,
  recentlyOpened,
  sortPieces,
  type PieceStats,
} from '../src/library/sort.ts';
import { DEFAULT_SORT } from '@pcaa/shared';
import {
  emptyResume,
  lastOpenedAt,
  readResume,
  rememberLibrarySort,
  savedLibrarySort,
} from '../src/resume/resume.ts';

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-10-14T12:00:00.000Z');

const piece = (id: string, over: Partial<Piece> = {}): Piece =>
  ({
    id,
    title: id,
    artist: '',
    tags: [],
    notes: '',
    targetBpm: null,
    scores: [],
    tracks: [],
    bookmarks: [],
    pinned: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  }) as Piece;

const session = (pieceId: string, startedAt: string, durationSec: number): PracticeSession =>
  ({
    id: `${pieceId}-${startedAt}`,
    pieceId,
    startedAt,
    durationSec,
    bpm: null,
    note: '',
  }) as PracticeSession;

const ids = (list: readonly Piece[]) => list.map((p) => p.id as string);

const alpha = piece('alpha', {
  artist: 'Zappa',
  targetBpm: 120,
  createdAt: '2026-10-03T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
});
const bravo = piece('bravo', {
  artist: 'Bach',
  targetBpm: 60,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
});
const charlie = piece('charlie', {
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
});
const pieces = [charlie, alpha, bravo];

const sessions = [
  session('alpha', '2026-10-13T09:00:00.000Z', 600),
  session('alpha', '2026-10-01T09:00:00.000Z', 1200),
  session('bravo', '2026-09-01T09:00:00.000Z', 300),
];
const opened: Record<string, number | null> = { alpha: NOW - 1000, charlie: NOW - 5000 };
const stats = buildStats(pieces, sessions, (id) => opened[id] ?? null);

const sorted = (sort: Parameters<typeof sortPieces>[1]['sort'], reversed = false) =>
  ids(sortPieces(pieces, { sort, reversed }, stats));

describe('library stats', () => {
  it('totals practice and keeps the latest session per piece', () => {
    expect(stats.get('alpha')).toEqual({
      lastOpenedAt: NOW - 1000,
      lastPractisedAt: Date.parse('2026-10-13T09:00:00.000Z'),
      practisedSec: 1800,
    });
    expect(stats.get('charlie')).toEqual({ ...NO_STATS, lastOpenedAt: NOW - 5000 });
  });
});

describe('sortPieces', () => {
  it('sorts by title and by artist, with no artist last', () => {
    expect(sorted('title')).toEqual(['alpha', 'bravo', 'charlie']);
    expect(sorted('artist')).toEqual(['bravo', 'alpha', 'charlie']);
  });

  it('puts the newest first for added and edited', () => {
    expect(sorted('added')).toEqual(['alpha', 'charlie', 'bravo']);
    expect(sorted('edited')).toEqual(['bravo', 'alpha', 'charlie']);
  });

  it('puts never-opened and never-practised pieces last', () => {
    expect(sorted('opened')).toEqual(['alpha', 'charlie', 'bravo']);
    expect(sorted('practised')).toEqual(['alpha', 'bravo', 'charlie']);
    expect(sorted('most-practised')).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('needs practice: never practised first, then the longest ago', () => {
    expect(sorted('neglected')).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('sorts target tempo slowest first, with no target last', () => {
    expect(sorted('tempo')).toEqual(['bravo', 'alpha', 'charlie']);
  });

  it('reverses the order but keeps missing values last', () => {
    expect(sorted('tempo', true)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(sorted('opened', true)).toEqual(['charlie', 'alpha', 'bravo']);
    expect(sorted('title', true)).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('keeps pinned pieces on top in every sort, either direction', () => {
    const withPin = [charlie, alpha, { ...bravo, pinned: true }];
    for (const reversed of [false, true]) {
      expect(sortPieces(withPin, { sort: 'title', reversed }, stats)[0]?.id).toBe('bravo');
      expect(sortPieces(withPin, { sort: 'neglected', reversed }, stats)[0]?.id).toBe('bravo');
    }
  });

  it('leaves setlist order alone, pins included, unless reversed', () => {
    const withPin = [charlie, { ...alpha, pinned: true }, bravo];
    expect(ids(sortPieces(withPin, { sort: 'setlist', reversed: false }, stats))).toEqual([
      'charlie',
      'alpha',
      'bravo',
    ]);
    expect(ids(sortPieces(withPin, { sort: 'setlist', reversed: true }, stats))).toEqual([
      'bravo',
      'alpha',
      'charlie',
    ]);
  });

  it('breaks ties by title', () => {
    const same = [piece('zulu'), piece('echo'), piece('mike')];
    expect(ids(sortPieces(same, { sort: 'added', reversed: false }, new Map()))).toEqual([
      'echo',
      'mike',
      'zulu',
    ]);
  });
});

describe('recentlyOpened', () => {
  it('lists opened pieces newest first, up to the limit', () => {
    expect(recentlyOpened(pieces, stats, 4).map((r) => r.piece.id)).toEqual(['alpha', 'charlie']);
    expect(recentlyOpened(pieces, stats, 1).map((r) => r.piece.id)).toEqual(['alpha']);
  });
});

describe('pickForMe', () => {
  const s = (lastPractisedAt: number | null): PieceStats => ({ ...NO_STATS, lastPractisedAt });

  it('weights by days since last practised, capped, never practised at the cap', () => {
    expect(neglectWeight(s(null), NOW)).toBe(NEGLECT_CAP_DAYS);
    expect(neglectWeight(s(NOW - 10 * DAY), NOW)).toBe(10);
    expect(neglectWeight(s(NOW - 500 * DAY), NOW)).toBe(NEGLECT_CAP_DAYS);
    expect(neglectWeight(s(NOW - 1000), NOW)).toBe(1);
  });

  it('picks in proportion to the weights', () => {
    const local = new Map<string, PieceStats>([
      ['alpha', s(NOW - 1 * DAY)],
      ['bravo', s(NOW - 3 * DAY)],
    ]);
    const two = [alpha, bravo];
    expect(pickForMe(two, local, NOW, () => 0)?.id).toBe('alpha');
    expect(pickForMe(two, local, NOW, () => 0.24)?.id).toBe('alpha');
    expect(pickForMe(two, local, NOW, () => 0.26)?.id).toBe('bravo');
    expect(pickForMe(two, local, NOW, () => 0.999)?.id).toBe('bravo');
  });

  it('returns null when there is nothing to pick', () => {
    expect(pickForMe([], stats, NOW)).toBeNull();
  });
});

describe('ago', () => {
  it.each([
    [10_000, 'just now'],
    [5 * 60_000, '5 min ago'],
    [3 * 3600_000, '3 h ago'],
    [30 * 3600_000, 'yesterday'],
    [5 * DAY, '5 days ago'],
    [21 * DAY, '3 weeks ago'],
    [90 * DAY, '3 months ago'],
    [800 * DAY, '2 years ago'],
  ])('%i ms → %s', (ms, text) => {
    expect(ago(NOW - ms, NOW)).toBe(text);
  });

  it('treats a clock that runs ahead as just now', () => {
    expect(ago(NOW + 5000, NOW)).toBe('just now');
  });
});

describe('remembered sort', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('lives in the resume state and falls back to the old per-browser key, then the default', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}'))),
    );
    expect(savedLibrarySort()).toEqual(DEFAULT_SORT);
    localStorage.setItem('pcaa.library.sort.v1', '{"sort":"added","reversed":true}');
    expect(savedLibrarySort()).toEqual({ sort: 'added', reversed: true });
    localStorage.setItem('pcaa.library.sort.v1', 'not json');
    expect(savedLibrarySort()).toEqual(DEFAULT_SORT);
    rememberLibrarySort({ sort: 'neglected', reversed: false });
    expect(savedLibrarySort()).toEqual({ sort: 'neglected', reversed: false });
    expect(readResume().librarySort).toMatchObject({ sort: 'neglected', reversed: false });
  });
});

describe('lastOpenedAt', () => {
  it('takes the newest stamp for the piece from any resume entry', () => {
    const state = {
      ...emptyResume(),
      opened: { romanza: { at: 100 } },
      scores: {
        'romanza/a.pdf': { page: 2, y: 0, at: 400 },
        'romanzas/b.pdf': { page: 1, y: 0, at: 900 },
      },
      timers: { romanza: { accumulatedMs: 1, startedAt: 0, at: 250 } },
    };
    expect(lastOpenedAt(state, 'romanza')).toBe(400);
    expect(lastOpenedAt(state, 'never')).toBeNull();
  });
});
