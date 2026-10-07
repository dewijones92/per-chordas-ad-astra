import { describe, expect, it } from 'vitest';
import {
  bpmForBar,
  clampBpm,
  defaultSettings,
  TickScheduler,
  type MetronomeSettings,
} from '../src/metronome/scheduler.ts';
import { tapTempo } from '../src/metronome/tap-tempo.ts';

const settings = (over: Partial<MetronomeSettings> = {}): MetronomeSettings => ({
  ...defaultSettings(),
  ...over,
});

describe('TickScheduler', () => {
  it('spaces quarter notes by 60/bpm and accents the first beat of each bar', () => {
    const ticks = new TickScheduler(settings({ bpm: 120, beatsPerBar: 3 }), 10).until(10 + 3);
    expect(ticks.map((t) => t.time)).toEqual([10, 10.5, 11, 11.5, 12, 12.5]);
    expect(ticks.map((t) => t.kind)).toEqual(['bar', 'beat', 'beat', 'bar', 'beat', 'beat']);
    expect(ticks.map((t) => t.bar)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('subdivides beats and marks the off-beats as sub ticks', () => {
    const ticks = new TickScheduler(settings({ bpm: 60, beatsPerBar: 2, subdivision: 3 }), 0).until(
      2,
    );
    expect(ticks).toHaveLength(6);
    expect(ticks[1]?.time).toBeCloseTo(1 / 3);
    expect(ticks.map((t) => t.kind)).toEqual(['bar', 'sub', 'sub', 'beat', 'sub', 'sub']);
  });

  it('does not accent when accenting is off', () => {
    const ticks = new TickScheduler(settings({ accentFirstBeat: false }), 0).until(1);
    expect(ticks.every((t) => t.kind === 'beat')).toBe(true);
  });

  it('does not drift over a long session', () => {
    const scheduler = new TickScheduler(settings({ bpm: 97, subdivision: 3 }), 0);
    const ticks = scheduler.until(3600);
    const last = ticks.at(-1)!;
    expect(ticks).toHaveLength(97 * 60 * 3);
    expect(last.time).toBeCloseTo(3600 - 60 / 97 / 3, 9);
  });

  it('never emits a tick at or beyond the horizon, and continues seamlessly', () => {
    const scheduler = new TickScheduler(settings({ bpm: 60 }), 0);
    expect(scheduler.until(1).map((t) => t.time)).toEqual([0]);
    expect(scheduler.peekTime()).toBe(1);
    expect(scheduler.until(3).map((t) => t.time)).toEqual([1, 2]);
  });
});

describe('speed trainer', () => {
  const trainer = { enabled: true, stepBpm: 10, everyBars: 2, maxBpm: 100 };

  it('raises the tempo every N bars up to the ceiling', () => {
    const s = settings({ bpm: 80, trainer });
    expect([0, 1, 2, 3, 4, 5, 6, 40].map((bar) => bpmForBar(s, bar))).toEqual([
      80, 80, 90, 90, 100, 100, 100, 100,
    ]);
  });

  it('is ignored when disabled', () => {
    expect(bpmForBar(settings({ bpm: 80, trainer: { ...trainer, enabled: false } }), 10)).toBe(80);
  });

  it('applies the new tempo from the bar it changes on', () => {
    const ticks = new TickScheduler(
      settings({
        bpm: 60,
        beatsPerBar: 1,
        trainer: { ...trainer, everyBars: 1, stepBpm: 60, maxBpm: 120 },
      }),
      0,
    ).until(2);
    expect(ticks.map((t) => [t.time, t.bpm])).toEqual([
      [0, 60],
      [1, 120],
      [1.5, 120],
    ]);
  });
});

describe('clampBpm', () => {
  it('keeps tempo in a playable range', () => {
    expect([5, 72.6, 900].map(clampBpm)).toEqual([20, 73, 400]);
  });
});

describe('tapTempo', () => {
  it('needs two taps, then averages the last few intervals', () => {
    let state = tapTempo([], 0);
    expect(state.bpm).toBeNull();
    state = tapTempo(state.taps, 500);
    expect(state.bpm).toBe(120);
    state = tapTempo(state.taps, 1100);
    expect(state.bpm).toBe(109);
  });

  it('starts over after a long pause', () => {
    const state = tapTempo([0, 500], 5000);
    expect(state).toEqual({ taps: [5000], bpm: null });
  });

  it('only remembers a short window of taps', () => {
    let taps: number[] = [];
    for (let t = 0; t <= 3000; t += 250) taps = tapTempo(taps, t).taps;
    expect(taps).toHaveLength(5);
  });
});
