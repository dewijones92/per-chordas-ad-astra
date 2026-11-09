import { makeMscx, PIANO_WALTZ } from '@pcaa/fixtures';
import { describe, expect, it } from 'vitest';
import { parseScoreText } from '../src/music/load.ts';
import {
  beatPoint,
  lastBeatBefore,
  loopBetween,
  loopEnds,
  loopSpan,
  sameLoop,
  wholeBars,
} from '../src/music/loop-range.ts';
import { buildPerformance } from '../src/music/performance.ts';

const perf = buildPerformance(parseScoreText(makeMscx(PIANO_WALTZ, '4.50')));

describe('loops by the beat', () => {
  it('finds the bar and beat under a time', () => {
    expect(perf.bars.map((b) => [b.number, b.start, b.end, b.beats])).toEqual([
      [1, 0, 1.5, 3],
      [2, 1.5, 3, 3],
      [1, 3, 4.5, 3],
      [3, 4.5, 6, 3],
    ]);
    expect(beatPoint(perf, 0)).toEqual({ bar: 0, beat: 0 });
    expect(beatPoint(perf, 0.6)).toEqual({ bar: 0, beat: 1 });
    expect(beatPoint(perf, 1.49)).toEqual({ bar: 0, beat: 2 });
    expect(beatPoint(perf, 3.5)).toEqual({ bar: 2, beat: 1 });
  });

  it('ends a loop at the beat line nearest a time, never before the first beat', () => {
    expect(lastBeatBefore(perf, 1.5)).toEqual({ bar: 0, beat: 2 });
    expect(lastBeatBefore(perf, 1.6)).toEqual({ bar: 0, beat: 2 });
    expect(lastBeatBefore(perf, 1.8)).toEqual({ bar: 1, beat: 0 });
    expect(lastBeatBefore(perf, 0.9)).toEqual({ bar: 0, beat: 1 });
    expect(lastBeatBefore(perf, 0)).toEqual({ bar: 0, beat: 0 });
  });

  it('makes a loop from two beats in either order, leaving out a beat that is a whole-bar edge', () => {
    expect(loopBetween(perf, { bar: 1, beat: 2 }, { bar: 0, beat: 1 })).toEqual({
      from: 0,
      to: 1,
      fromBeat: 1,
    });
    expect(loopBetween(perf, { bar: 0, beat: 0 }, { bar: 1, beat: 2 })).toEqual({ from: 0, to: 1 });
    expect(loopBetween(perf, { bar: 2, beat: 1 }, { bar: 2, beat: 1 })).toEqual({
      from: 2,
      to: 2,
      fromBeat: 1,
      toBeat: 2,
    });
  });

  it('turns a loop into seconds, whole bars exactly as before', () => {
    expect(loopSpan(perf, { from: 0, to: 0 })).toEqual({ start: 0, end: 1.5 });
    expect(loopSpan(perf, { from: 0, to: 1, fromBeat: 1 })).toEqual({ start: 0.5, end: 3 });
    expect(loopSpan(perf, { from: 2, to: 2, fromBeat: 1, toBeat: 2 })).toEqual({
      start: 3.5,
      end: 4,
    });
    expect(loopSpan(perf, { from: 9, to: 9 })).toBeNull();
    expect(loopSpan(perf, null)).toBeNull();
  });

  it('compares loops, beats included, and names their ends for the label', () => {
    expect(sameLoop({ from: 0, to: 1 }, { from: 0, to: 1, fromBeat: 0 })).toBe(true);
    expect(sameLoop({ from: 0, to: 1 }, { from: 0, to: 1, toBeat: 2 })).toBe(false);
    expect(wholeBars({ from: 0, to: 1 })).toBe(true);
    expect(wholeBars({ from: 0, to: 1, fromBeat: 2 })).toBe(false);
    expect(loopEnds(perf, { from: 2, to: 3, fromBeat: 1, toBeat: 2 })).toEqual({
      fromBar: 1,
      toBar: 3,
      fromBeat: 2,
      toBeat: 2,
      whole: false,
    });
  });
});
