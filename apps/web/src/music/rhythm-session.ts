import { onsetGroups } from './hands.ts';
import type { PerfNote } from './performance.ts';

export const PERFECT_SECONDS = 0.08;
export const GOOD_SECONDS = 0.18;
export const POP_DURATION_MS = 600;
export const WRONG_FLASH_MS = 350;
export const SEEK_SLACK = 1e-3;
const TIMING_EPSILON = 1e-10;

export type NoteGrade = 'perfect' | 'early' | 'late' | 'missed';
export type PopGrade = NoteGrade | 'wrong';
export interface HitPop {
  pitch: number;
  grade: PopGrade;
  atMs: number;
}
export interface RhythmTarget {
  at: number;
  pitches: readonly number[];
  notes: readonly PerfNote[];
}
export interface RhythmStats {
  notes: number;
  perfect: number;
  good: number;
  missed: number;
  wrong: number;
  streak: number;
  bestStreak: number;
  accuracy: number;
}
export interface RhythmView {
  stats: RhythmStats;
  noteHits: ReadonlyMap<PerfNote, NoteGrade>;
  finished: boolean;
  lastGrade: PopGrade | null;
}

export function rhythmTargets(
  notes: readonly PerfNote[],
  mine: (note: PerfNote) => boolean,
  transpose: number,
): RhythmTarget[] {
  const targets: RhythmTarget[] = [];
  for (const group of onsetGroups(notes.filter(mine))) {
    const first = group[0];
    if (!first) continue;
    const pitches = [...new Set(group.map((n) => n.pitch + transpose))].sort((a, b) => a - b);
    targets.push({ at: first.start, pitches, notes: group });
  }
  return targets;
}

const emptyStats = (): RhythmStats => ({
  notes: 0,
  perfect: 0,
  good: 0,
  missed: 0,
  wrong: 0,
  streak: 0,
  bestStreak: 0,
  accuracy: 0,
});

export class RhythmSession {
  private targets: readonly RhythmTarget[] = [];
  private cursor = 0;
  private totals = emptyStats();
  private readonly hits = new Map<PerfNote, NoteGrade>();
  private readonly judged = new Map<RhythmTarget, Set<number>>();
  private pops: HitPop[] = [];
  private finished = false;
  private lastGrade: PopGrade | null = null;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  readonly getVersion = (): number => this.version;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  view(_version?: number): RhythmView {
    return {
      stats: { ...this.totals },
      noteHits: this.hits,
      finished: this.finished,
      lastGrade: this.lastGrade,
    };
  }

  setTargets(targets: readonly RhythmTarget[], song: number): void {
    this.clear();
    this.targets = targets;
    this.jumpTo(song);
  }

  jumpTo(song: number): void {
    const first = this.targets.findIndex((t) => t.at >= song - SEEK_SLACK);
    this.cursor = first < 0 ? this.targets.length : first;
    for (const target of this.targets.slice(this.cursor)) {
      this.judged.delete(target);
      for (const n of target.notes) this.hits.delete(n);
    }
    this.pops = [];
    this.lastGrade = null;
    this.finished = false;
    console.info('dewidebug rhythm seek', { song, cursor: this.cursor });
    this.changed();
  }

  private record(target: RhythmTarget | null, pitch: number, grade: PopGrade, nowMs: number): void {
    const stats = this.totals;
    if (target && grade !== 'wrong') {
      const pitches = this.judged.get(target) ?? new Set<number>();
      pitches.add(pitch);
      this.judged.set(target, pitches);
      const offset = (target.pitches[0] ?? 0) - Math.min(...target.notes.map((n) => n.pitch));
      for (const n of target.notes) if (n.pitch + offset === pitch) this.hits.set(n, grade);
      stats.notes++;
    }
    if (grade === 'wrong') stats.wrong++;
    else if (grade === 'missed') stats.missed++;
    else if (grade === 'perfect') stats.perfect++;
    else stats.good++;
    stats.streak = grade === 'wrong' || grade === 'missed' ? 0 : stats.streak + 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.accuracy = (stats.perfect + stats.good) / (stats.notes + stats.wrong);
    this.lastGrade = grade;
    this.pops.push({ pitch, grade, atMs: nowMs });
    console.info('dewidebug rhythm grade', { pitch, grade, target: target?.at });
  }

  advance(position: number, speed: number, nowMs: number): boolean {
    let changed = false;
    for (
      let t = this.targets[this.cursor];
      t && t.at < position - (GOOD_SECONDS + TIMING_EPSILON) * speed;
      t = this.targets[++this.cursor]
    ) {
      for (const pitch of t.pitches) {
        if (this.judged.get(t)?.has(pitch)) continue;
        this.record(t, pitch, 'missed', nowMs);
        changed = true;
      }
    }
    if (changed) this.changed();
    return changed;
  }

  press(pitch: number, position: number, speed: number, nowMs: number): PopGrade {
    this.advance(position, speed, nowMs);
    let closest: RhythmTarget | null = null;
    let distance = Infinity;
    for (let i = this.cursor; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (!t || t.at > position + (GOOD_SECONDS + TIMING_EPSILON) * speed) break;
      const delta = Math.abs((position - t.at) / speed);
      if (delta < distance && t.pitches.includes(pitch) && !this.judged.get(t)?.has(pitch)) {
        closest = t;
        distance = delta;
      }
    }
    let grade: PopGrade = 'wrong';
    if (closest)
      grade =
        distance <= PERFECT_SECONDS + TIMING_EPSILON
          ? 'perfect'
          : position < closest.at
            ? 'early'
            : 'late';
    this.record(closest, pitch, grade, nowMs);
    this.changed();
    return grade;
  }

  activePops(nowMs: number): HitPop[] {
    this.pops = this.pops.filter((pop) => nowMs - pop.atMs <= POP_DURATION_MS);
    return [...this.pops];
  }

  finish(position: number, speed: number, nowMs: number): void {
    if (this.finished) return;
    console.info('dewidebug rhythm finish', { position });
    this.advance(Infinity, speed, nowMs);
    this.finished = true;
    this.changed();
  }

  private clear(): void {
    this.cursor = 0;
    this.totals = emptyStats();
    this.hits.clear();
    this.judged.clear();
    this.pops = [];
    this.finished = false;
    this.lastGrade = null;
  }

  reset(): void {
    this.clear();
    this.changed();
  }
}
