export interface LoopWindow {
  startSec: number;
  endSec: number;
}

export const MIN_LOOP_SEC = 0.2;

export function normaliseLoop(a: number, b: number, duration: number): LoopWindow | null {
  const start = Math.max(0, Math.min(a, b));
  const end = Math.min(duration, Math.max(a, b));
  return end - start >= MIN_LOOP_SEC ? { startSec: start, endSec: end } : null;
}

export function shouldWrap(currentSec: number, loop: LoopWindow | null): boolean {
  return loop !== null && currentSec >= loop.endSec;
}

export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  const peaks = new Float32Array(Math.max(0, buckets));
  if (buckets <= 0 || samples.length === 0) return peaks;
  const size = samples.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((b + 1) * size)));
    let max = 0;
    for (let i = from; i < to; i++) {
      const v = Math.abs(samples[i] ?? 0);
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  return peaks;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m)}:${s.toFixed(1).padStart(4, '0')}`;
}
