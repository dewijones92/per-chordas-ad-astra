import { describe, expect, it } from 'vitest';
import { computePeaks, formatTime, normaliseLoop, shouldWrap } from '../src/looper/loop-math.ts';

describe('loop maths', () => {
  it('orders and clamps a loop to the track', () => {
    expect(normaliseLoop(20, 10, 15)).toEqual({ startSec: 10, endSec: 15 });
    expect(normaliseLoop(-5, 3, 100)).toEqual({ startSec: 0, endSec: 3 });
  });

  it('refuses a loop too short to practise', () => {
    expect(normaliseLoop(5, 5.1, 100)).toBeNull();
  });

  it('wraps only once playback reaches the loop end', () => {
    const loop = { startSec: 2, endSec: 4 };
    expect(shouldWrap(3.99, loop)).toBe(false);
    expect(shouldWrap(4, loop)).toBe(true);
    expect(shouldWrap(10, null)).toBe(false);
  });

  it('computes absolute peaks per bucket', () => {
    const peaks = computePeaks(new Float32Array([0.1, -0.9, 0.2, 0.3, -0.05, 0.5]), 3);
    expect([...peaks].map((v) => Math.round(v * 100))).toEqual([90, 30, 50]);
    expect(computePeaks(new Float32Array(), 4)).toEqual(new Float32Array(4));
    expect(computePeaks(new Float32Array([1]), 0)).toHaveLength(0);
  });

  it('formats times for display', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(75.25)).toBe('1:15.3');
    expect(formatTime(Number.NaN)).toBe('0:00.0');
  });
});
