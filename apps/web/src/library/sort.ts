import type { Piece, PracticeSession } from '@pcaa/shared';
import { z } from 'zod';

export const LIBRARY_SORTS = [
  'title',
  'artist',
  'added',
  'edited',
  'opened',
  'practised',
  'neglected',
  'most-practised',
  'tempo',
] as const;
export const LibrarySort = z.enum(LIBRARY_SORTS);
export type LibrarySort = z.infer<typeof LibrarySort>;
export type SortKey = LibrarySort | 'setlist';

export const SORT_LABELS: Record<SortKey, string> = {
  setlist: 'Setlist order',
  title: 'Title A–Z',
  artist: 'Artist A–Z',
  added: 'Recently added',
  edited: 'Recently edited',
  opened: 'Recently opened',
  practised: 'Recently practised',
  neglected: 'Needs practice',
  'most-practised': 'Most practised',
  tempo: 'Target tempo, slowest first',
};

export const SortChoice = z.object({ sort: LibrarySort, reversed: z.boolean() });
export type SortChoice = z.infer<typeof SortChoice>;
export const DEFAULT_SORT: SortChoice = { sort: 'title', reversed: false };

export interface PieceStats {
  lastOpenedAt: number | null;
  lastPractisedAt: number | null;
  practisedSec: number;
}

export const NO_STATS: PieceStats = { lastOpenedAt: null, lastPractisedAt: null, practisedSec: 0 };

export function practiceStats(
  sessions: readonly PracticeSession[],
): Map<string, Pick<PieceStats, 'lastPractisedAt' | 'practisedSec'>> {
  const map = new Map<string, Pick<PieceStats, 'lastPractisedAt' | 'practisedSec'>>();
  for (const s of sessions) {
    const at = Date.parse(s.startedAt);
    const entry = map.get(s.pieceId) ?? { lastPractisedAt: null, practisedSec: 0 };
    map.set(s.pieceId, {
      lastPractisedAt: entry.lastPractisedAt === null ? at : Math.max(entry.lastPractisedAt, at),
      practisedSec: entry.practisedSec + s.durationSec,
    });
  }
  return map;
}

export function buildStats(
  pieces: readonly Piece[],
  sessions: readonly PracticeSession[],
  lastOpenedAt: (pieceId: string) => number | null,
): Map<string, PieceStats> {
  const practice = practiceStats(sessions);
  return new Map(
    pieces.map((p) => [
      p.id as string,
      {
        lastOpenedAt: lastOpenedAt(p.id),
        lastPractisedAt: practice.get(p.id)?.lastPractisedAt ?? null,
        practisedSec: practice.get(p.id)?.practisedSec ?? 0,
      },
    ]),
  );
}

type Value = number | string | null;

const descending = (n: number): number => -n;

const valueOf: Record<LibrarySort, (p: Piece, s: PieceStats) => Value> = {
  title: (p) => p.title.toLocaleLowerCase(),
  artist: (p) => (p.artist.trim() === '' ? null : p.artist.toLocaleLowerCase()),
  added: (p) => descending(Date.parse(p.createdAt)),
  edited: (p) => descending(Date.parse(p.updatedAt)),
  opened: (_, s) => (s.lastOpenedAt === null ? null : descending(s.lastOpenedAt)),
  practised: (_, s) => (s.lastPractisedAt === null ? null : descending(s.lastPractisedAt)),
  neglected: (_, s) => s.lastPractisedAt ?? 0,
  'most-practised': (_, s) => (s.practisedSec === 0 ? null : descending(s.practisedSec)),
  tempo: (p) => p.targetBpm,
};

function compareValues(a: Value, b: Value): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return 0;
}

export function sortPieces(
  pieces: readonly Piece[],
  choice: { sort: SortKey; reversed: boolean },
  stats: ReadonlyMap<string, PieceStats>,
): Piece[] {
  const { sort } = choice;
  if (sort === 'setlist') return choice.reversed ? [...pieces].reverse() : [...pieces];
  const sign = choice.reversed ? -1 : 1;
  const value = valueOf[sort];
  const keyed = pieces.map((p) => ({ p, v: value(p, stats.get(p.id) ?? NO_STATS) }));
  keyed.sort((a, b) => {
    if (a.p.pinned !== b.p.pinned) return a.p.pinned ? -1 : 1;
    if (a.v === null || b.v === null) {
      if (a.v !== b.v) return a.v === null ? 1 : -1;
    } else {
      const c = compareValues(a.v, b.v);
      if (c !== 0) return sign * c;
    }
    return a.p.title.localeCompare(b.p.title);
  });
  return keyed.map((k) => k.p);
}

export function recentlyOpened(
  pieces: readonly Piece[],
  stats: ReadonlyMap<string, PieceStats>,
  limit: number,
): { piece: Piece; at: number }[] {
  return pieces
    .flatMap((piece) => {
      const at = stats.get(piece.id)?.lastOpenedAt ?? null;
      return at === null ? [] : [{ piece, at }];
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

const DAY_MS = 24 * 3600 * 1000;
export const NEGLECT_CAP_DAYS = 60;

export function neglectWeight(stats: PieceStats, now: number): number {
  if (stats.lastPractisedAt === null) return NEGLECT_CAP_DAYS;
  const days = (now - stats.lastPractisedAt) / DAY_MS;
  return Math.min(NEGLECT_CAP_DAYS, Math.max(1, days));
}

export function pickForMe(
  pieces: readonly Piece[],
  stats: ReadonlyMap<string, PieceStats>,
  now: number,
  random: () => number = Math.random,
): Piece | null {
  const weights = pieces.map((p) => neglectWeight(stats.get(p.id) ?? NO_STATS, now));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;
  let target = random() * total;
  for (const [i, piece] of pieces.entries()) {
    target -= weights[i] ?? 0;
    if (target < 0) return piece;
  }
  return pieces.at(-1) ?? null;
}

export function ago(at: number, now: number): string {
  const ms = Math.max(0, now - at);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  const days = Math.floor(ms / DAY_MS);
  if (days < 2) return 'yesterday';
  if (days < 14) return `${String(days)} days ago`;
  if (days < 60) return `${String(Math.floor(days / 7))} weeks ago`;
  if (days < 730) return `${String(Math.floor(days / 30))} months ago`;
  return `${String(Math.floor(days / 365))} years ago`;
}

const SORT_STORAGE_KEY = 'pcaa.library.sort.v1';

export function loadSortChoice(): SortChoice {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_SORT;
    const parsed = SortChoice.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export function saveSortChoice(choice: SortChoice): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    return;
  }
}
