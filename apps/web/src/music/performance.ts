import { DEFAULT_BPM, DEFAULT_VELOCITY, TPQ, type ScoreModel, type ScoreStaff } from './model.ts';
import { unroll } from './unroll.ts';

export interface PerfNote {
  pitch: number;
  start: number;
  end: number;
  staff: number;
  velocity: number;
  bar: number;
}

export interface PerfBar {
  measure: number;
  number: number;
  start: number;
  end: number;
}

export interface Performance {
  title: string;
  notes: PerfNote[];
  bars: PerfBar[];
  staves: ScoreStaff[];
  duration: number;
  lowest: number;
  highest: number;
  keyFifths: number;
  keyMinor: boolean;
  warnings: string[];
}

interface TempoSegment {
  tick: number;
  seconds: number;
  bpm: number;
}

const TIE_EPSILON = 1e-6;

function latestAt<T extends { tick: number }>(items: readonly T[], tick: number): T | undefined {
  let found: T | undefined;
  for (const item of items) {
    if (item.tick <= tick + TIE_EPSILON) found = item;
    else break;
  }
  return found;
}

export function buildPerformance(score: ScoreModel): Performance {
  const { order, warnings } = unroll(score.measures, score.voltas);
  const notesByMeasure = new Map<number, typeof score.notes>();
  for (const n of score.notes) {
    const list = notesByMeasure.get(n.measure);
    if (list) list.push(n);
    else notesByMeasure.set(n.measure, [n]);
  }
  const partOf = new Map(score.staves.map((s) => [s.index, s.part]));
  const dynamicsByPart = new Map<number, { tick: number; velocity: number }[]>();
  for (const d of score.dynamics) {
    const list = dynamicsByPart.get(d.part) ?? [];
    list.push(d);
    dynamicsByPart.set(d.part, list);
  }

  const tempoEvents: { tick: number; bpm: number }[] = [];
  const rawNotes: (Omit<PerfNote, 'start' | 'end'> & {
    startTick: number;
    endTick: number;
    tie: boolean;
  })[] = [];
  const barTicks: { measure: number; number: number; start: number; end: number }[] = [];

  let played = 0;
  order.forEach((index, occurrence) => {
    const measure = score.measures[index];
    if (!measure) return;
    const shift = played - measure.tick;
    const tempoAtStart = latestAt(score.tempos, measure.tick);
    tempoEvents.push({ tick: played, bpm: tempoAtStart?.bpm ?? DEFAULT_BPM });
    for (const t of score.tempos) {
      if (
        t.tick > measure.tick + TIE_EPSILON &&
        t.tick < measure.tick + measure.ticks - TIE_EPSILON
      ) {
        tempoEvents.push({ tick: t.tick + shift, bpm: t.bpm });
      }
    }
    for (const n of notesByMeasure.get(index) ?? []) {
      const dynamics = dynamicsByPart.get(partOf.get(n.staff) ?? -1) ?? [];
      rawNotes.push({
        pitch: n.pitch,
        staff: n.staff,
        velocity: latestAt(dynamics, n.tick)?.velocity ?? DEFAULT_VELOCITY,
        bar: occurrence,
        startTick: n.tick + shift,
        endTick: n.tick + shift + n.ticks,
        tie: n.tieForward,
      });
    }
    barTicks.push({
      measure: index,
      number: measure.number,
      start: played,
      end: played + measure.ticks,
    });
    played += measure.ticks;
  });

  rawNotes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  const merged: typeof rawNotes = [];
  const openTies = new Map<string, (typeof rawNotes)[number]>();
  for (const n of rawNotes) {
    const key = `${String(n.staff)}:${String(n.pitch)}`;
    const held = openTies.get(key);
    if (held && Math.abs(held.endTick - n.startTick) < 1) {
      held.endTick = Math.max(held.endTick, n.endTick);
      held.tie = n.tie;
      if (!n.tie) openTies.delete(key);
      continue;
    }
    if (held) openTies.delete(key);
    merged.push(n);
    if (n.tie) openTies.set(key, n);
  }

  const segments: TempoSegment[] = [];
  for (const e of tempoEvents.sort((a, b) => a.tick - b.tick)) {
    const last = segments.at(-1);
    if (last && Math.abs(last.tick - e.tick) < TIE_EPSILON) {
      last.bpm = e.bpm;
      continue;
    }
    const seconds = last ? last.seconds + ((e.tick - last.tick) / TPQ) * (60 / last.bpm) : 0;
    if (last?.bpm === e.bpm) continue;
    segments.push({ tick: e.tick, seconds, bpm: e.bpm });
  }
  if (segments.length === 0) segments.push({ tick: 0, seconds: 0, bpm: DEFAULT_BPM });

  let cursor = 0;
  const toSeconds = (tick: number): number => {
    while (cursor > 0 && (segments[cursor]?.tick ?? 0) > tick) cursor -= 1;
    while (cursor + 1 < segments.length && (segments[cursor + 1]?.tick ?? Infinity) <= tick)
      cursor += 1;
    const seg = segments[cursor] ?? { tick: 0, seconds: 0, bpm: DEFAULT_BPM };
    return seg.seconds + ((tick - seg.tick) / TPQ) * (60 / seg.bpm);
  };

  const notes: PerfNote[] = merged.map((n) => ({
    pitch: n.pitch,
    staff: n.staff,
    velocity: n.velocity,
    bar: n.bar,
    start: Math.max(0, toSeconds(n.startTick)),
    end: Math.max(toSeconds(n.startTick) + 0.03, toSeconds(n.endTick)),
  }));
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const bars: PerfBar[] = barTicks.map((b) => ({
    measure: b.measure,
    number: b.number,
    start: toSeconds(b.start),
    end: toSeconds(b.end),
  }));
  let lowest = Infinity;
  let highest = -Infinity;
  let lastEnd = bars.at(-1)?.end ?? 0;
  for (const n of notes) {
    lowest = Math.min(lowest, n.pitch);
    highest = Math.max(highest, n.pitch);
    lastEnd = Math.max(lastEnd, n.end);
  }
  return {
    title: score.title,
    notes,
    bars,
    staves: score.staves,
    duration: lastEnd,
    lowest: Number.isFinite(lowest) ? lowest : 60,
    highest: Number.isFinite(highest) ? highest : 72,
    keyFifths: score.keys[0]?.fifths ?? 0,
    keyMinor: score.keys[0]?.minor ?? false,
    warnings: [...score.warnings, ...warnings],
  };
}

export function barAt(perf: Performance, seconds: number): number {
  let lo = 0;
  let hi = perf.bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((perf.bars[mid]?.start ?? 0) <= seconds) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}
