import {
  bitKey,
  pieceKey,
  speedPercent,
  type TodayBit,
  type TodayFacts,
  type TodayPiece,
} from '@pcaa/shared';
import { strings, units } from '../strings.ts';
import { ago } from './sort.ts';

const DAY_MS = 24 * 3600 * 1000;

export const TODAY_LIMIT = 5;
export const TODAY_MAX_BITS_PER_PIECE = 2;
export const BIT_SLOW_GAP = 0.1;
export const BIT_STALE_DAYS = 7;
export const BIT_REST_DAYS = 1;
export const BIT_STALE_CAP_DAYS = 21;
export const BIT_STALE_WEIGHT = 3;
export const PIECE_STALE_DAYS = 3;
export const PIECE_BASE_SCORE = 30;
export const PIECE_STALE_CAP_DAYS = 30;
export const PIECE_STALE_WEIGHT = 2;

export interface TodaySuggestion {
  key: string;
  pieceId: string;
  title: string;
  bit: TodayBit | null;
  score: number;
  triedAt: number | null;
  lastPractisedAt: number | null;
  bestBpm: number | null;
  targetBpm: number | null;
}

type Stamps = ReadonlyMap<string, number>;

export function sameLocalDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function bitCandidate(
  piece: TodayPiece,
  bit: TodayBit,
  triedAt: number | null,
  now: number,
): TodaySuggestion | null {
  const days = triedAt === null ? null : (now - triedAt) / DAY_MS;
  if (days !== null && days < BIT_REST_DAYS) return null;
  const gap = Math.max(0, 1 - bit.bestSpeed);
  const stale = days !== null && days >= BIT_STALE_DAYS;
  if (gap < BIT_SLOW_GAP && !stale) return null;
  return {
    key: bitKey(piece.id, bit.file, bit.id),
    pieceId: piece.id,
    title: piece.title,
    bit,
    score: gap * 100 + Math.min(days ?? BIT_STALE_DAYS, BIT_STALE_CAP_DAYS) * BIT_STALE_WEIGHT,
    triedAt,
    lastPractisedAt: piece.lastPractisedAt,
    bestBpm: piece.bestBpm,
    targetBpm: piece.targetBpm,
  };
}

function pieceCandidate(piece: TodayPiece, now: number): TodaySuggestion | null {
  if (!piece.pinned) return null;
  const days = piece.lastPractisedAt === null ? null : (now - piece.lastPractisedAt) / DAY_MS;
  if (days !== null && days < PIECE_STALE_DAYS) return null;
  return {
    key: pieceKey(piece.id),
    pieceId: piece.id,
    title: piece.title,
    bit: null,
    score:
      PIECE_BASE_SCORE +
      Math.min(days ?? PIECE_STALE_CAP_DAYS, PIECE_STALE_CAP_DAYS) * PIECE_STALE_WEIGHT,
    triedAt: null,
    lastPractisedAt: piece.lastPractisedAt,
    bestBpm: piece.bestBpm,
    targetBpm: piece.targetBpm,
  };
}

export function rankToday(
  facts: TodayFacts,
  tried: Stamps,
  done: Stamps,
  now: number,
  limit = TODAY_LIMIT,
): TodaySuggestion[] {
  const candidates: TodaySuggestion[] = [];
  for (const piece of facts.pieces) {
    const bits = piece.bits.flatMap((b) => {
      const c = bitCandidate(piece, b, tried.get(bitKey(piece.id, b.file, b.id)) ?? null, now);
      return c ? [c] : [];
    });
    const asPiece = bits.length === 0 ? pieceCandidate(piece, now) : null;
    candidates.push(...bits, ...(asPiece ? [asPiece] : []));
  }
  const open = candidates.filter((c) => {
    const at = done.get(c.key);
    return at === undefined || !sameLocalDay(at, now);
  });
  open.sort(
    (a, b) =>
      b.score - a.score ||
      a.title.localeCompare(b.title) ||
      (a.bit?.name ?? '').localeCompare(b.bit?.name ?? ''),
  );
  const perPiece = new Map<string, number>();
  const chosen: TodaySuggestion[] = [];
  for (const c of open) {
    if (chosen.length >= limit) break;
    const used = perPiece.get(c.pieceId) ?? 0;
    if (c.bit !== null && used >= TODAY_MAX_BITS_PER_PIECE) continue;
    perPiece.set(c.pieceId, used + 1);
    chosen.push(c);
  }
  return chosen;
}

export function describeSuggestion(s: TodaySuggestion, now: number): string {
  const u = units.today;
  if (s.bit) {
    const best = s.bit.bestSpeed > 0 ? u.best(speedPercent(s.bit.bestSpeed)) : u.noBest;
    const detail = s.triedAt === null ? best : `${best}, ${u.lastTried(ago(s.triedAt, now))}`;
    return strings.library.today.bit(s.bit.name, s.title, detail);
  }
  const last =
    s.lastPractisedAt === null ? u.notPractised : u.lastPractised(ago(s.lastPractisedAt, now));
  const detail =
    s.bestBpm !== null && s.targetBpm !== null ? `${last}, ${u.bpm(s.bestBpm, s.targetBpm)}` : last;
  return strings.library.today.piece(s.title, detail);
}

export function suggestionHref(s: TodaySuggestion): string {
  if (!s.bit) return `/piece/${s.pieceId}`;
  const params = new URLSearchParams({ bit: s.bit.id, file: s.bit.file });
  return `/piece/${s.pieceId}?${params.toString()}`;
}
