import { pitchName } from './keys.ts';

export interface ChordNote {
  pitch: number;
  start: number;
}

export interface ChordBar {
  number: number;
  start: number;
  end: number;
  beats: number;
}

export interface ChordLabel {
  start: number;
  name: string;
}

const MIN_DISTINCT = 2;
const MAX_DISTINCT = 5;
const EDGE = 0.001;

const QUALITIES: readonly { suffix: string; intervals: readonly number[] }[] = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'm7♭5', intervals: [0, 3, 6, 10] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { suffix: '6', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', intervals: [0, 3, 7, 9] },
  { suffix: 'm(maj7)', intervals: [0, 3, 7, 11] },
  { suffix: 'add9', intervals: [0, 2, 4, 7] },
  { suffix: 'madd9', intervals: [0, 2, 3, 7] },
  { suffix: '7sus4', intervals: [0, 5, 7, 10] },
  { suffix: '7', intervals: [0, 4, 10] },
  { suffix: 'm7', intervals: [0, 3, 10] },
  { suffix: 'maj7', intervals: [0, 4, 11] },
  { suffix: '', intervals: [0, 4] },
  { suffix: 'm', intervals: [0, 3] },
];

const pc = (pitch: number) => ((pitch % 12) + 12) % 12;

function sameSet(a: ReadonlySet<number>, b: readonly number[]): boolean {
  return a.size === b.length && b.every((i) => a.has(i));
}

interface Named {
  root: number;
  suffix: string;
  bass: number;
  rank: number;
}

function matchTemplates(classes: ReadonlySet<number>, bass: number, penalty: number): Named | null {
  const found: Named[] = [];
  for (const root of classes) {
    const above = new Set([...classes].map((c) => (c - root + 12) % 12));
    QUALITIES.forEach((q, i) => {
      if (sameSet(above, q.intervals))
        found.push({ root, suffix: q.suffix, bass, rank: penalty + (root === bass ? 0 : 100) + i });
    });
  }
  return found.sort((a, b) => a.rank - b.rank)[0] ?? null;
}

function analyse(pitches: readonly number[]): Named | null {
  if (pitches.length === 0) return null;
  const classes = new Set(pitches.map(pc));
  if (classes.size < MIN_DISTINCT || classes.size > MAX_DISTINCT) return null;
  const bass = pc(Math.min(...pitches));
  const whole = matchTemplates(classes, bass, 0);
  if (whole) return whole;
  const upper = new Set(classes);
  upper.delete(bass);
  return upper.size >= MIN_DISTINCT ? matchTemplates(upper, bass, 1000) : null;
}

function spell(found: Named, flats: boolean): string {
  const slash = found.root === found.bass ? '' : `/${pitchName(found.bass, flats)}`;
  return `${pitchName(found.root, flats)}${found.suffix}${slash}`;
}

export function nameChord(pitches: readonly number[], flats: boolean): string | null {
  const found = analyse(pitches);
  return found ? spell(found, flats) : null;
}

function startingIn(notes: readonly ChordNote[], from: number, to: number): ChordNote[] {
  return notes.filter((n) => n.start >= from - EDGE && n.start < to - EDGE);
}

interface Window {
  label: ChordLabel;
  harmony: string;
}

function nameWindow(
  window: readonly ChordNote[],
  transpose: number,
  flats: boolean,
): Window | null {
  const found = analyse(window.map((n) => n.pitch + transpose));
  if (!found) return null;
  return {
    label: { start: Math.min(...window.map((n) => n.start)), name: spell(found, flats) },
    harmony: `${String(found.root)}${found.suffix}`,
  };
}

export function chordLabels(
  notes: readonly ChordNote[],
  bars: readonly ChordBar[],
  transpose: number,
  flats: boolean,
): ChordLabel[] {
  const labels: ChordLabel[] = [];
  let previous: string | null = null;
  const counts = { whole: 0, halves: 0, unnamed: 0 };
  const unnamed: string[] = [];
  for (const bar of bars) {
    const inBar = startingIn(notes, bar.start, bar.end);
    if (inBar.length === 0) continue;
    const mid = (bar.start + bar.end) / 2;
    const halves = [startingIn(inBar, bar.start, mid), startingIn(inBar, mid, bar.end)].map((w) =>
      nameWindow(w, transpose, flats),
    );
    const whole = nameWindow(inBar, transpose, flats);
    const beats = Math.round(bar.beats);
    const evenBar = beats >= 4 && beats % 2 === 0;
    let found: (Window | null)[];
    if (evenBar && halves.every((h) => h !== null)) {
      found = halves;
      counts.halves += 1;
    } else if (whole) {
      found = [whole];
      counts.whole += 1;
    } else {
      found = halves;
      if (halves.some((h) => h !== null)) counts.halves += 1;
      else {
        counts.unnamed += 1;
        if (unnamed.length < 5)
          unnamed.push(
            `${String(bar.number)}:${[...new Set(inBar.map((n) => pc(n.pitch + transpose)))].join(',')}`,
          );
      }
    }
    for (const f of found) {
      if (f && f.harmony !== previous) labels.push(f.label);
      previous = f?.harmony ?? null;
    }
  }
  console.info('dewidebug chord names', {
    bars: bars.length,
    labels: labels.length,
    wholeBars: counts.whole,
    splitBars: counts.halves,
    unnamedBars: counts.unnamed,
    unnamedExamples: unnamed,
  });
  return labels;
}
