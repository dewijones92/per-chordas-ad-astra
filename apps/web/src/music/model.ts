export const TPQ = 480;
export const GRACE_TICKS = TPQ / 8;

export type StaffRole = 'right' | 'left' | 'single';

export interface ScoreStaff {
  index: number;
  part: number;
  name: string;
  role: StaffRole;
}

export interface ScorePart {
  name: string;
  staves: number[];
}

export interface Jump {
  jumpTo: string;
  playUntil: string;
  continueAt: string;
  playRepeats: boolean;
}

export interface ScoreMeasure {
  index: number;
  number: number;
  tick: number;
  ticks: number;
  startRepeat: boolean;
  endRepeat: number;
  markers: string[];
  jump: Jump | null;
  sectionEnd: boolean;
}

export interface Volta {
  start: number;
  end: number;
  endings: number[];
}

export interface ScoreNote {
  staff: number;
  measure: number;
  pitch: number;
  tick: number;
  ticks: number;
  tieForward: boolean;
  grace: boolean;
}

export interface TempoMark {
  tick: number;
  bpm: number;
}

export interface DynamicMark {
  tick: number;
  part: number;
  velocity: number;
}

export interface KeyMark {
  tick: number;
  fifths: number;
  minor: boolean;
}

export type ScoreFormat = 'musescore' | 'musicxml';

export interface ScoreModel {
  title: string;
  format: ScoreFormat;
  version: string;
  parts: ScorePart[];
  staves: ScoreStaff[];
  measures: ScoreMeasure[];
  voltas: Volta[];
  notes: ScoreNote[];
  tempos: TempoMark[];
  dynamics: DynamicMark[];
  keys: KeyMark[];
  notation: Notation | null;
  warnings: string[];
}

export const DEFAULT_BPM = 120;
export const DEFAULT_VELOCITY = 80;

const DYNAMIC_VELOCITY: Readonly<Record<string, number>> = {
  pppp: 10,
  ppp: 16,
  pp: 33,
  p: 49,
  mp: 64,
  mf: 80,
  f: 96,
  ff: 112,
  fff: 126,
  ffff: 127,
  fp: 96,
  sf: 112,
  sfz: 112,
  sff: 126,
  sffz: 126,
  sfp: 112,
  rfz: 112,
  rf: 112,
  fz: 112,
};

export function velocityForDynamic(name: string): number | null {
  return DYNAMIC_VELOCITY[name.trim().toLowerCase()] ?? null;
}

export function roleFor(staffCount: number, position: number): StaffRole {
  if (staffCount < 2) return 'single';
  return position === 0 ? 'right' : 'left';
}

export function staffName(partName: string, staffCount: number, position: number): string {
  if (staffCount === 1) return partName;
  const role = roleFor(staffCount, position);
  return `${partName} ${role === 'right' ? 'RH' : role === 'left' ? 'LH' : String(position + 1)}`;
}

export function firstPerTick<T extends { tick: number }>(items: readonly T[]): T[] {
  const byTick = new Map<number, T>();
  for (const item of items) if (!byTick.has(item.tick)) byTick.set(item.tick, item);
  return [...byTick.values()].sort((a, b) => a.tick - b.tick);
}

export function uniqueStaffNames(staves: ScoreStaff[]): void {
  const counts = new Map<string, number>();
  for (const s of staves) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const s of staves) {
    if ((counts.get(s.name) ?? 0) < 2) continue;
    const n = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, n);
    s.name = `${s.name} ${String(n)}`;
  }
}

export interface ClefMark {
  staff: number;
  tick: number;
  clef: string;
}

export interface TimeMark {
  tick: number;
  n: number;
  d: number;
}

export interface EventNote {
  pitch: number;
  tpc: number | null;
  tieForward: boolean;
  silent: boolean;
}

export type BeamMode = 'auto' | 'begin' | 'mid' | 'no' | 'begin32' | 'begin64';

export interface EventTuplet {
  normal: number;
  actual: number;
  start: boolean;
  stop: boolean;
}

export interface NotationEvent {
  staff: number;
  voice: number;
  measure: number;
  tick: number;
  ticks: number;
  type: string;
  dots: number;
  rest: boolean;
  measureRest: boolean;
  grace: 'before' | 'after' | null;
  tuplet: EventTuplet | null;
  tupletKey: string | null;
  beam: BeamMode;
  slurStart: boolean;
  slurStop: boolean;
  notes: EventNote[];
}

export interface Notation {
  events: NotationEvent[];
  clefs: ClefMark[];
  times: TimeMark[];
}

const BEAM_MODES: readonly BeamMode[] = ['begin', 'mid', 'no', 'begin32', 'begin64'];

export function beamMode(raw: string): BeamMode {
  return BEAM_MODES.find((m) => m === raw) ?? 'auto';
}

export function markTupletEnds(events: NotationEvent[]): void {
  const groups = new Map<string, NotationEvent[]>();
  for (const e of events) {
    if (!e.tupletKey || !e.tuplet) continue;
    const list = groups.get(e.tupletKey) ?? [];
    list.push(e);
    groups.set(e.tupletKey, list);
  }
  for (const list of groups.values()) {
    const sorted = list.filter((e) => !e.grace).sort((a, b) => a.tick - b.tick);
    const first = sorted[0];
    const last = sorted.at(-1);
    if (first?.tuplet) first.tuplet.start = true;
    if (last?.tuplet) last.tuplet.stop = true;
  }
}
