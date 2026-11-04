import { TPQ, noteKey, type ScoreMeasure, type ScoreNote } from './model.ts';
import type { NotationNoteSpan } from './notation-protocol.ts';

const TOLERANCE_TICKS = 3;
const EPSILON_Q = 1e-6;

export interface StaveNotes {
  byId: ReadonlyMap<string, ScoreNote>;
  idsOf: ReadonlyMap<string, readonly string[]>;
}

function barOf(starts: readonly number[], q: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((starts[mid] ?? Infinity) <= q + EPSILON_Q) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function matchStaveNotes(
  spans: readonly NotationNoteSpan[],
  starts: readonly number[],
  measures: readonly ScoreMeasure[],
  notes: readonly ScoreNote[],
  transpose: number,
): StaveNotes {
  const inBar = new Map<number, ScoreNote[]>();
  for (const n of notes) {
    if (n.grace) continue;
    const list = inBar.get(n.measure) ?? [];
    list.push(n);
    inBar.set(n.measure, list);
  }
  const byId = new Map<string, ScoreNote>();
  const idsOf = new Map<string, string[]>();
  const taken = new Set<ScoreNote>();
  let unmatched = 0;
  for (const span of spans) {
    const bar = barOf(starts, span.on);
    const measure = measures[bar];
    const start = starts[bar];
    if (!measure || start === undefined) {
      unmatched += 1;
      continue;
    }
    const rel = (span.on - start) * TPQ;
    const candidates = (inBar.get(bar) ?? []).filter(
      (n) =>
        Math.abs(n.tick - measure.tick - rel) <= TOLERANCE_TICKS &&
        n.pitch + transpose === span.pitch,
    );
    const hit = candidates.find((n) => !taken.has(n)) ?? candidates[0];
    if (!hit) {
      unmatched += 1;
      continue;
    }
    taken.add(hit);
    byId.set(span.id, hit);
    const key = noteKey(hit);
    idsOf.set(key, [...(idsOf.get(key) ?? []), span.id]);
  }
  console.info('dewidebug stave notes matched to written notes', {
    drawn: spans.length,
    matched: byId.size,
    unmatched,
  });
  return { byId, idsOf };
}
