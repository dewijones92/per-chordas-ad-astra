import type { LoopRange } from '@pcaa/shared';
import { barAt, type PerfBar, type Performance } from './performance.ts';

export interface BeatPoint {
  bar: number;
  beat: number;
}

export function beatsIn(bar: Pick<PerfBar, 'beats'>): number {
  return Math.max(1, Math.round(bar.beats));
}

function beatSeconds(bar: PerfBar): number {
  return (bar.end - bar.start) / beatsIn(bar);
}

export function beatPoint(perf: Performance, seconds: number): BeatPoint | null {
  const bar = barAt(perf, seconds);
  const b = perf.bars[bar];
  if (!b) return null;
  const beat = Math.floor((seconds - b.start) / Math.max(1e-6, beatSeconds(b)) + 1e-6);
  return { bar, beat: Math.min(beatsIn(b) - 1, Math.max(0, beat)) };
}

export function lastBeatBefore(perf: Performance, seconds: number): BeatPoint | null {
  const here = beatPoint(perf, seconds);
  const bar = here ? perf.bars[here.bar] : undefined;
  if (!here || !bar) return null;
  const into = (seconds - bar.start) / Math.max(1e-6, beatSeconds(bar)) - here.beat;
  if (into >= 0.5) return here;
  if (here.beat > 0) return { bar: here.bar, beat: here.beat - 1 };
  const previous = perf.bars[here.bar - 1];
  return previous ? { bar: here.bar - 1, beat: beatsIn(previous) - 1 } : here;
}

function order(a: BeatPoint, b: BeatPoint): number {
  return a.bar - b.bar || a.beat - b.beat;
}

export function loopBetween(perf: Performance, a: BeatPoint, b: BeatPoint): LoopRange {
  const [first, last] = order(a, b) <= 0 ? [a, b] : [b, a];
  const lastBar = perf.bars[last.bar];
  const range: LoopRange = { from: first.bar, to: last.bar };
  if (first.beat > 0) range.fromBeat = first.beat;
  if (lastBar && last.beat + 1 < beatsIn(lastBar)) range.toBeat = last.beat + 1;
  return range;
}

export function loopOf(range: LoopRange): LoopRange {
  const loop: LoopRange = { from: range.from, to: range.to };
  if (range.fromBeat !== undefined) loop.fromBeat = range.fromBeat;
  if (range.toBeat !== undefined) loop.toBeat = range.toBeat;
  return loop;
}

export function loopStartPoint(loop: LoopRange): BeatPoint {
  return { bar: loop.from, beat: loop.fromBeat ?? 0 };
}

export function loopEndPoint(perf: Performance, loop: LoopRange): BeatPoint {
  const bar = perf.bars[loop.to];
  return { bar: loop.to, beat: (loop.toBeat ?? (bar ? beatsIn(bar) : 1)) - 1 };
}

export function loopSpan(
  perf: Performance,
  loop: LoopRange | null,
): { start: number; end: number } | null {
  if (!loop) return null;
  const from = perf.bars[loop.from];
  const to = perf.bars[loop.to];
  if (!from || !to) return null;
  const fromBeat = Math.min(beatsIn(from) - 1, Math.max(0, loop.fromBeat ?? 0));
  const start = from.start + fromBeat * beatSeconds(from);
  const end =
    loop.toBeat === undefined
      ? to.end
      : to.start + Math.min(beatsIn(to), Math.max(1, loop.toBeat)) * beatSeconds(to);
  return end > start ? { start, end } : null;
}

export function wholeBars(loop: LoopRange): boolean {
  return (loop.fromBeat ?? 0) === 0 && loop.toBeat === undefined;
}

export function sameLoop(a: LoopRange | null, b: LoopRange | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.from === b.from &&
    a.to === b.to &&
    (a.fromBeat ?? 0) === (b.fromBeat ?? 0) &&
    a.toBeat === b.toBeat
  );
}

export interface LoopEnds {
  fromBar: number;
  toBar: number;
  fromBeat: number;
  toBeat: number;
  whole: boolean;
}

export function loopEnds(perf: Performance, loop: LoopRange): LoopEnds | null {
  const from = perf.bars[loop.from];
  const to = perf.bars[loop.to];
  if (!from || !to) return null;
  return {
    fromBar: from.number,
    toBar: to.number,
    fromBeat: (loop.fromBeat ?? 0) + 1,
    toBeat: loop.toBeat ?? beatsIn(to),
    whole: wholeBars(loop),
  };
}
