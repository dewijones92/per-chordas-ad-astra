import type { ScoreStaff } from './model.ts';
import type { PerfNote, Performance } from './performance.ts';

export type Hand = 'right' | 'left';

const ONSET_SECONDS = 0.03;
const RELEASE_SECONDS = 0.01;
const BEAM = 32;
const MAX_SPAN = 12;
const CLOSE_CHORD = 4;
const CHORD_SPLIT_COST = 20;
const MAX_NOTES = 5;
const LEFT_CEILING = 64;
const RIGHT_FLOOR = 55;

interface Held {
  pitch: number;
  end: number;
  hand: Hand;
}

interface State {
  cost: number;
  held: Held[];
  centre: { right: number | null; left: number | null };
  split: number;
  parent: State | null;
}

function onsetGroups(notes: readonly PerfNote[]): PerfNote[][] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const groups: PerfNote[][] = [];
  let current: PerfNote[] = [];
  let at = -Infinity;
  for (const n of sorted) {
    if (n.start - at > ONSET_SECONDS && current.length > 0) {
      groups.push(current.sort((a, b) => a.pitch - b.pitch));
      current = [];
    }
    if (current.length === 0) at = n.start;
    current.push(n);
  }
  if (current.length > 0) groups.push(current.sort((a, b) => a.pitch - b.pitch));
  return groups;
}

function handCost(pitches: readonly number[]): number {
  if (pitches.length === 0) return 0;
  const span = Math.max(...pitches) - Math.min(...pitches);
  return span + Math.max(0, span - MAX_SPAN) * 40 + Math.max(0, pitches.length - MAX_NOTES) * 500;
}

function situation(s: State): string {
  const held = s.held
    .map((h) => (h.pitch * 2 + (h.hand === 'left' ? 1 : 0)) * 100000 + Math.round(h.end * 100))
    .sort((a, b) => a - b)
    .join(',');
  return `${held}|${String(Math.round(s.centre.left ?? -1))}|${String(Math.round(s.centre.right ?? -1))}`;
}

function mean(pitches: readonly number[]): number | null {
  return pitches.length === 0 ? null : pitches.reduce((a, b) => a + b, 0) / pitches.length;
}

function step(
  state: State,
  group: readonly PerfNote[],
  split: number,
  keyUp: (n: PerfNote) => number,
): State {
  const at = group[0]?.start ?? 0;
  const held = state.held.filter((h) => h.end > at + RELEASE_SECONDS);
  const left = group.slice(0, split).map((n) => n.pitch);
  const right = group.slice(split).map((n) => n.pitch);
  const allLeft = [...held.filter((h) => h.hand === 'left').map((h) => h.pitch), ...left];
  const allRight = [...held.filter((h) => h.hand === 'right').map((h) => h.pitch), ...right];
  let cost = handCost(allLeft) + handCost(allRight);
  if (allLeft.length > 0 && allRight.length > 0) {
    const overlap = Math.max(...allLeft) - Math.min(...allRight);
    if (overlap >= 0) cost += 1000 * (overlap + 1);
  }
  if (left.length > 0 && right.length > 0) {
    const gap = Math.min(...right) - Math.max(...left);
    if (gap <= CLOSE_CHORD) cost += CHORD_SPLIT_COST * (CLOSE_CHORD + 1 - gap);
  }
  for (const p of left) cost += Math.max(0, p - LEFT_CEILING) * 2;
  for (const p of right) cost += Math.max(0, RIGHT_FLOOR - p) * 2;
  const newLeft = mean(left);
  const newRight = mean(right);
  if (newLeft !== null && state.centre.left !== null)
    cost += Math.abs(newLeft - state.centre.left) * 0.5;
  if (newRight !== null && state.centre.right !== null)
    cost += Math.abs(newRight - state.centre.right) * 0.5;
  return {
    cost: state.cost + cost,
    held: [
      ...held,
      ...group.map((n, i): Held => ({
        pitch: n.pitch,
        end: keyUp(n),
        hand: i < split ? 'left' : 'right',
      })),
    ],
    centre: { left: newLeft ?? state.centre.left, right: newRight ?? state.centre.right },
    split,
    parent: state,
  };
}

export function assignHands(
  notes: readonly PerfNote[],
  keyUp: (n: PerfNote) => number = (n) => n.end,
): Map<PerfNote, Hand> {
  const started = performance.now();
  const groups = onsetGroups(notes);
  let beam: State[] = [
    { cost: 0, held: [], centre: { left: null, right: null }, split: 0, parent: null },
  ];
  for (const group of groups) {
    const next: State[] = [];
    for (const state of beam)
      for (let split = 0; split <= group.length; split++)
        next.push(step(state, group, split, keyUp));
    next.sort((a, b) => a.cost - b.cost);
    const seen = new Set<string>();
    beam = [];
    for (const s of next) {
      const key = situation(s);
      if (seen.has(key)) continue;
      seen.add(key);
      beam.push(s);
      if (beam.length === BEAM) break;
    }
  }
  const hands = new Map<PerfNote, Hand>();
  let state: State | null = beam[0] ?? null;
  for (let g = groups.length - 1; g >= 0 && state; g--) {
    const group = groups[g] ?? [];
    group.forEach((n, i) => hands.set(n, i < (state?.split ?? 0) ? 'left' : 'right'));
    state = state.parent;
  }
  console.info('dewidebug hands assigned', {
    notes: notes.length,
    moments: groups.length,
    left: [...hands.values()].filter((h) => h === 'left').length,
    cost: Math.round(beam[0]?.cost ?? 0),
    ms: Math.round(performance.now() - started),
  });
  return hands;
}

export interface Lane extends ScoreStaff {
  label: string;
}

export interface Lanes {
  byHand: boolean;
  lanes: Lane[];
  laneOf: (n: PerfNote) => number;
}

export function partLanes(perf: Performance): Lanes {
  return {
    byHand: false,
    lanes: perf.staves.map((s) => ({ ...s, label: s.name })),
    laneOf: (n) => n.staff,
  };
}

export function handLanes(
  hands: Map<PerfNote, Hand>,
  names: { right: string; left: string },
  labels: { right: string; left: string },
): Lanes {
  return {
    byHand: true,
    lanes: [
      { index: 0, part: 0, name: names.right, label: labels.right, role: 'right' },
      { index: 1, part: 0, name: names.left, label: labels.left, role: 'left' },
    ],
    laneOf: (n) => (hands.get(n) === 'left' ? 1 : 0),
  };
}
