import { z } from 'zod';

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
});
export type ResumeState = z.output<typeof ResumeState>;

export const emptyResume = (): ResumeState => ({
  lastPath: null,
  scores: {},
  pieceScore: {},
  loopers: {},
  timers: {},
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

export function mergeResume(a: ResumeState, b: ResumeState): ResumeState {
  const lastPath =
    a.lastPath === null
      ? b.lastPath
      : b.lastPath === null
        ? a.lastPath
        : b.lastPath.at >= a.lastPath.at
          ? b.lastPath
          : a.lastPath;
  return {
    lastPath,
    scores: newest(a.scores, b.scores),
    pieceScore: newest(a.pieceScore, b.pieceScore),
    loopers: newest(a.loopers, b.loopers),
    timers: newest(a.timers, b.timers),
  };
}
