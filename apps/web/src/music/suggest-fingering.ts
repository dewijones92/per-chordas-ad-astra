export interface FingerNote {
  pitch: number;
  start: number;
  end: number;
}

export type HandSide = 'right' | 'left';
type Fingers = readonly number[];

const ONSET = 0.03;
const REPOSITION_GAP = 0.6;
const BLACK = new Set([1, 3, 6, 8, 10]);
const NATURAL: Readonly<Record<string, number>> = {
  '1-2': 2,
  '1-3': 3.5,
  '1-4': 5,
  '1-5': 7,
  '2-3': 2,
  '2-4': 3.5,
  '2-5': 5,
  '3-4': 2,
  '3-5': 3.5,
  '4-5': 2,
};
const COMFORTABLE: Readonly<Record<string, number>> = {
  '1-2': 7,
  '1-3': 9,
  '1-4': 10,
  '1-5': 12,
  '2-3': 4,
  '2-4': 5,
  '2-5': 8,
  '3-4': 3,
  '3-5': 5,
  '4-5': 3,
};
const CROSSING_FINGER: Readonly<Record<number, number>> = { 2: 1, 3: 0, 4: 0.5 };
const IMPOSSIBLE = 20;
const LEAP = 7;
const LEAP_COST = 4;
const LEAP_LANDING = 0.3;

const isBlack = (pitch: number) => BLACK.has(((pitch % 12) + 12) % 12);

function pairCost(
  f1: number,
  p1: number,
  f2: number,
  p2: number,
  hand: HandSide,
  together: boolean,
): number {
  const reach = stretchCost(f1, p1, f2, p2, hand, together);
  if (together || Math.abs(p2 - p1) <= LEAP) return reach;
  const outward = (hand === 'right' ? p2 - p1 : p1 - p2) > 0;
  return Math.min(reach, LEAP_COST + LEAP_LANDING * (outward ? 5 - f2 : f2 - 1));
}

function stretchCost(
  f1: number,
  p1: number,
  f2: number,
  p2: number,
  hand: HandSide,
  together: boolean,
): number {
  const d = hand === 'right' ? p2 - p1 : p1 - p2;
  if (f1 === f2) return d === 0 ? 0 : 3 + Math.abs(d) * 0.5;
  if (d === 0) return 1;
  const lo = Math.min(f1, f2);
  const hi = Math.max(f1, f2);
  const pair = `${String(lo)}-${String(hi)}`;
  const span = Math.abs(d);
  if ((f2 - f1) * d > 0) {
    const natural = NATURAL[pair] ?? 2;
    const comfortable = COMFORTABLE[pair] ?? 3;
    return Math.abs(span - natural) * 0.6 + Math.max(0, span - comfortable) * 2;
  }
  if (together || lo !== 1) return IMPOSSIBLE + span;
  return 1 + span * 0.3 + (CROSSING_FINGER[hi] ?? IMPOSSIBLE) + Math.max(0, span - 4) * 3;
}

function placeCost(fingers: Fingers, pitches: readonly number[]): number {
  let cost = 0;
  fingers.forEach((f, i) => {
    const p = pitches[i] ?? 0;
    if (f === 1 && isBlack(p)) cost += 2;
    if (f === 5 && isBlack(p)) cost += 0.5;
  });
  return cost;
}

function chordCost(fingers: Fingers, pitches: readonly number[], hand: HandSide): number {
  let cost = 0;
  for (let i = 1; i < fingers.length; i++) {
    cost += pairCost(
      fingers[i - 1] ?? 1,
      pitches[i - 1] ?? 0,
      fingers[i] ?? 1,
      pitches[i] ?? 0,
      hand,
      true,
    );
  }
  return cost;
}

function choices(count: number, hand: HandSide): Fingers[] {
  if (count > 5) {
    const spread = Array.from({ length: count }, (_, i) => 1 + Math.round((i * 4) / (count - 1)));
    return [hand === 'right' ? spread : [...spread].reverse()];
  }
  const out: number[][] = [];
  const pick = (from: number, acc: number[]) => {
    if (acc.length === count) {
      out.push(hand === 'right' ? acc : [...acc].reverse());
      return;
    }
    for (let f = from; f <= 5; f++) pick(f + 1, [...acc, f]);
  };
  pick(1, []);
  return out;
}

interface Group {
  start: number;
  end: number;
  pitches: number[];
  notes: FingerNote[];
}

function groupsOf(notes: readonly FingerNote[]): Group[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const groups: Group[] = [];
  for (const n of sorted) {
    const last = groups.at(-1);
    if (last && n.start - last.start <= ONSET) {
      last.notes.push(n);
      last.end = Math.max(last.end, n.end);
      if (!last.pitches.includes(n.pitch)) last.pitches.push(n.pitch);
    } else {
      groups.push({ start: n.start, end: n.end, pitches: [n.pitch], notes: [n] });
    }
  }
  for (const g of groups) g.pitches.sort((a, b) => a - b);
  return groups;
}

function moveCost(prev: Group, pf: Fingers, next: Group, nf: Fingers, hand: HandSide): number {
  let cost = 0;
  next.pitches.forEach((p, i) => {
    let best = 0;
    let bestDistance = Infinity;
    prev.pitches.forEach((q, j) => {
      const distance = Math.abs(p - q);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = j;
      }
    });
    cost += pairCost(pf[best] ?? 1, prev.pitches[best] ?? 0, nf[i] ?? 1, p, hand, false);
  });
  const gap = next.start - prev.end;
  return (cost / next.pitches.length) * (gap > REPOSITION_GAP ? 0.25 : 1);
}

export function suggestBySide<T extends FingerNote>(
  notes: readonly T[],
  sideOf: (n: T) => HandSide,
): Map<T, number> {
  const result = new Map<T, number>();
  for (const side of ['right', 'left'] as const) {
    const mine = notes.filter((n) => sideOf(n) === side);
    for (const [n, f] of suggestFingering(mine, side)) result.set(n as T, f);
  }
  console.info('dewidebug suggested fingering', { notes: notes.length, fingered: result.size });
  return result;
}

export function suggestFingering(
  notes: readonly FingerNote[],
  hand: HandSide,
): Map<FingerNote, number> {
  const groups = groupsOf(notes);
  const result = new Map<FingerNote, number>();
  if (groups.length === 0) return result;
  const options = groups.map((g) => choices(g.pitches.length, hand));
  const local = groups.map((g, gi) =>
    (options[gi] ?? []).map((f) => chordCost(f, g.pitches, hand) + placeCost(f, g.pitches)),
  );
  let costs = (local[0] ?? []).map((c, ci) => c + (ci === 0 ? 0 : 1e-6 * ci));
  const back: number[][] = [];
  for (let gi = 1; gi < groups.length; gi++) {
    const prev = groups[gi - 1];
    const next = groups[gi];
    const prevOptions = options[gi - 1] ?? [];
    const nextOptions = options[gi] ?? [];
    if (!prev || !next) break;
    const row: number[] = [];
    const nextCosts = nextOptions.map((nf, ni) => {
      let best = Infinity;
      let from = 0;
      prevOptions.forEach((pf, pi) => {
        const c = (costs[pi] ?? Infinity) + moveCost(prev, pf, next, nf, hand);
        if (c < best) {
          best = c;
          from = pi;
        }
      });
      row.push(from);
      return best + (local[gi]?.[ni] ?? 0);
    });
    back.push(row);
    costs = nextCosts;
  }
  let at = costs.indexOf(Math.min(...costs));
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    const f = options[gi]?.[at];
    if (g && f) {
      for (const n of g.notes) result.set(n, f[g.pitches.indexOf(n.pitch)] ?? 1);
    }
    if (gi > 0) at = back[gi - 1]?.[at] ?? 0;
  }
  return result;
}
