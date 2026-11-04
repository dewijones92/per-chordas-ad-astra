import { keyboardLayout, keyForPitch } from './keyboard.ts';
import type { StaffColour } from './colours.ts';
import type { KeyRange } from './keys.ts';
import type { HandSide } from './suggest-fingering.ts';

export type { HandSide };

export const FINGERS = 5;
const ONSET = 0.03;
const MIN_DOWN = 0.12;
const ATTACK = 0.05;
const RELEASE = 0.08;
const MAX_GLIDE = 0.45;
const GLIDE_SHARE = 0.7;
const MIN_GLIDE = 0.1;
const IDLE_AFTER = 1;
const IDLE_BEFORE = 1;
const IDLE_FADE = 0.5;
export const IDLE_ALPHA = 0.3;

export interface HandNote {
  pitch: number;
  u: number;
  start: number;
  end: number;
  finger: number;
}

export interface HandTimeline {
  side: HandSide;
  length: number;
  times: Float64Array;
  busy: Float64Array;
  config: Float64Array;
  from: Float64Array;
  to: Float64Array;
  held: Uint8Array;
  carried: Uint8Array;
}

export interface HandPose {
  alpha: number;
  u: Float64Array;
  dip: Float64Array;
}

export interface HandLayer {
  side: HandSide;
  timeline: HandTimeline;
  colour: StaffColour;
  pose: HandPose;
  x: Float64Array;
}

export function whiteUnits(range: KeyRange): (pitch: number) => number {
  const layout = keyboardLayout(range, 1);
  return (pitch) => {
    const key = keyForPitch(layout, pitch, range);
    return key ? (key.x + key.width / 2) / layout.whiteWidth : 0;
  };
}

export function newPose(): HandPose {
  return { alpha: 1, u: new Float64Array(FINGERS), dip: new Float64Array(FINGERS) };
}

function groupsOf(notes: readonly HandNote[]): HandNote[][] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const groups: HandNote[][] = [];
  for (const n of sorted) {
    const last = groups.at(-1);
    if (last && n.start - (last[0]?.start ?? 0) <= ONSET) last.push(n);
    else groups.push([n]);
  }
  return groups;
}

function fillRest(config: Float64Array, base: number, held: Uint8Array, dir: number): void {
  const pinned: number[] = [];
  for (let f = 0; f < FINGERS; f++) if (held[base + f]) pinned.push(f);
  if (pinned.length === 0) return;
  for (let f = 0; f < FINGERS; f++) {
    if (held[base + f]) continue;
    let below = -1;
    let above = -1;
    for (const p of pinned) {
      if (p < f) below = p;
      else if (p > f && above < 0) above = p;
    }
    const lo = below >= 0 ? (config[base + below] ?? 0) : 0;
    const hi = above >= 0 ? (config[base + above] ?? 0) : 0;
    if (below >= 0 && above >= 0)
      config[base + f] = lo + ((hi - lo) * (f - below)) / (above - below);
    else if (below >= 0) config[base + f] = lo + dir * (f - below);
    else config[base + f] = hi - dir * (above - f);
  }
}

export function buildHandTimeline(notes: readonly HandNote[], side: HandSide): HandTimeline | null {
  const groups = groupsOf(notes.filter((n) => n.finger >= 1 && n.finger <= FINGERS));
  const length = groups.length;
  if (length === 0) return null;
  const dir = side === 'right' ? 1 : -1;
  const tl: HandTimeline = {
    side,
    length,
    times: new Float64Array(length),
    busy: new Float64Array(length),
    config: new Float64Array(length * FINGERS),
    from: new Float64Array(length * FINGERS),
    to: new Float64Array(length * FINGERS),
    held: new Uint8Array(length * FINGERS),
    carried: new Uint8Array(length * FINGERS),
  };
  groups.forEach((group, a) => {
    const at = group[0]?.start ?? 0;
    const base = a * FINGERS;
    tl.times[a] = at;
    if (a > 0) {
      const prev = base - FINGERS;
      for (let f = 0; f < FINGERS; f++) {
        if (tl.held[prev + f] && (tl.to[prev + f] ?? 0) > at + ONSET / 3) {
          tl.held[base + f] = 1;
          tl.carried[base + f] = 1;
          tl.config[base + f] = tl.config[prev + f] ?? 0;
          tl.from[base + f] = tl.from[prev + f] ?? 0;
          tl.to[base + f] = tl.to[prev + f] ?? 0;
        }
      }
    }
    for (const n of group) {
      const f = n.finger - 1;
      tl.held[base + f] = 1;
      tl.carried[base + f] = 0;
      tl.config[base + f] = n.u;
      tl.from[base + f] = n.start;
      tl.to[base + f] = Math.max(n.end, n.start + MIN_DOWN);
    }
    fillRest(tl.config, base, tl.held, dir);
    let busy = at;
    for (let f = 0; f < FINGERS; f++)
      if (tl.held[base + f]) busy = Math.max(busy, tl.to[base + f] ?? 0);
    tl.busy[a] = busy;
  });
  return tl;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

function lastAtOrBefore(times: Float64Array, length: number, t: number): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? Infinity) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

function glideOf(tl: HandTimeline, a: number): { tb: number; window: number; minGlide: number } {
  const ta = tl.times[a] ?? 0;
  const tb = tl.times[a + 1] ?? ta;
  const gap = tb - ta;
  return {
    tb,
    window: Math.min(MAX_GLIDE, gap * GLIDE_SHARE),
    minGlide: Math.min(MIN_GLIDE, gap / 2),
  };
}

function liftEnd(tl: HandTimeline, a: number, f: number): number {
  const base = a * FINGERS + f;
  const end = tl.to[base] ?? 0;
  if (a + 1 >= tl.length || tl.carried[base + FINGERS]) return end;
  const { tb, minGlide } = glideOf(tl, a);
  return Math.min(end, tb - minGlide);
}

function dipOf(tl: HandTimeline, a: number, f: number, t: number): number {
  const base = a * FINGERS + f;
  if (!tl.held[base]) return 0;
  const attack = clamp01((t - ((tl.from[base] ?? 0) - ATTACK)) / ATTACK);
  const end = liftEnd(tl, a, f);
  const release = t < end ? 1 : 1 - clamp01((t - end) / RELEASE);
  return attack * release;
}

export function poseAt(tl: HandTimeline, t: number, out: HandPose): HandPose {
  const a = lastAtOrBefore(tl.times, tl.length, t);
  if (a < 0) {
    for (let f = 0; f < FINGERS; f++) {
      out.u[f] = tl.config[f] ?? 0;
      out.dip[f] = 0;
    }
    out.alpha = alphaOf(Infinity, (tl.times[0] ?? 0) - t);
    return out;
  }
  const hasNext = a + 1 < tl.length;
  const next = hasNext ? glideOf(tl, a) : null;
  for (let f = 0; f < FINGERS; f++) {
    const base = a * FINGERS + f;
    const here = tl.config[base] ?? 0;
    if (next) {
      const free = tl.held[base] ? (tl.to[base] ?? 0) : (tl.times[a] ?? 0);
      const start = Math.min(Math.max(next.tb - next.window, free), next.tb - next.minGlide);
      const progress = smooth((t - start) / Math.max(1e-9, next.tb - start));
      out.u[f] = here + ((tl.config[base + FINGERS] ?? 0) - here) * progress;
    } else out.u[f] = here;
    let dip = dipOf(tl, a, f, t);
    if (a > 0 && !tl.carried[base]) dip = Math.max(dip, dipOf(tl, a - 1, f, t));
    out.dip[f] = dip;
  }
  out.alpha = alphaOf(t - (tl.busy[a] ?? 0), next ? next.tb - t : Infinity);
  return out;
}

function alphaOf(since: number, until: number): number {
  const idle =
    smooth((since - IDLE_AFTER) / IDLE_FADE) *
    smooth((until - (IDLE_BEFORE - IDLE_FADE)) / IDLE_FADE);
  return 1 - (1 - IDLE_ALPHA) * idle;
}
