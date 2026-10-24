import { z } from 'zod';
import { PieceView, PlayAlongPrefs, SortChoice, ViewMode } from './prefs.ts';

const at = z.number().int().nonnegative();
const key = z.string().min(1).max(200);

export const ResumeState = z.object({
  lastPath: z
    .object({ path: z.string().max(200), at })
    .nullable()
    .default(null),
  scores: z.record(key, z.object({ page: z.int().min(1), y: z.number().min(0), at })).default({}),
  pieceScore: z.record(key, z.object({ file: z.string().min(1).max(100), at })).default({}),
  loopers: z
    .record(
      key,
      z.object({
        track: z.string().min(1).max(100),
        positionSec: z.number().min(0),
        rate: z.number().min(0.25).max(2),
        loop: z.object({ startSec: z.number().min(0), endSec: z.number().min(0) }).nullable(),
        at,
      }),
    )
    .default({}),
  timers: z
    .record(key, z.object({ accumulatedMs: z.number().min(0), startedAt: z.number().min(0), at }))
    .default({}),
  opened: z.record(key, z.object({ at })).default({}),
  zoom: z.record(key, z.object({ value: z.number().positive().max(100), at })).default({}),
  viewMode: z.object({ mode: ViewMode, at }).nullable().default(null),
  librarySort: SortChoice.extend({ at }).nullable().default(null),
  playAlong: z.record(key, PlayAlongPrefs.extend({ at })).default({}),
  pieceView: z
    .record(key, z.object({ mode: PieceView, file: z.string().max(100).nullable(), at }))
    .default({}),
});
export type ResumeState = z.output<typeof ResumeState>;

export const emptyResume = (): ResumeState => ({
  lastPath: null,
  scores: {},
  pieceScore: {},
  loopers: {},
  timers: {},
  opened: {},
  zoom: {},
  viewMode: null,
  librarySort: null,
  playAlong: {},
  pieceView: {},
});

function newest<T extends { at: number }>(
  a: Record<string, T>,
  b: Record<string, T>,
): Record<string, T> {
  const merged: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const current = merged[k];
    if (current === undefined || v.at >= current.at) merged[k] = v;
  }
  return merged;
}

function newerOf<T extends { at: number }>(a: T | null, b: T | null): T | null {
  if (a === null) return b;
  if (b === null) return a;
  return b.at >= a.at ? b : a;
}

export function mergeResume(a: ResumeState, b: ResumeState): ResumeState {
  return {
    lastPath: newerOf(a.lastPath, b.lastPath),
    scores: newest(a.scores, b.scores),
    pieceScore: newest(a.pieceScore, b.pieceScore),
    loopers: newest(a.loopers, b.loopers),
    timers: newest(a.timers, b.timers),
    opened: newest(a.opened, b.opened),
    zoom: newest(a.zoom, b.zoom),
    viewMode: newerOf(a.viewMode, b.viewMode),
    librarySort: newerOf(a.librarySort, b.librarySort),
    playAlong: newest(a.playAlong, b.playAlong),
    pieceView: newest(a.pieceView, b.pieceView),
  };
}
