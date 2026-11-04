import { onsetGroups, LEFT_OUT } from './hands.ts';
import type { PerfNote } from './performance.ts';

export const CHORD_WINDOW_MS = 300;
export const EARLY_SECONDS = 0.3;
const SEEK_SLACK = 1e-3;

export interface WaitTarget {
  at: number;
  pitches: readonly number[];
}

export interface WaitStats {
  targets: number;
  notes: number;
  right: number;
  wrong: number;
  waitedMs: number;
}

export interface WaitView {
  stats: WaitStats;
  waiting: boolean;
  expected: number[];
  finished: boolean;
}

export type PressOutcome =
  | { kind: 'ignored'; why: 'nothing-to-play' | 'too-early' }
  | { kind: 'correct'; done: boolean }
  | { kind: 'wrong' };

export function playerLanes(
  lanes: readonly number[],
  hidden: readonly number[],
  muted: readonly number[],
): Set<number> {
  const shown = lanes.filter((l) => l !== LEFT_OUT && !hidden.includes(l));
  const chosen = shown.filter((l) => muted.includes(l));
  return new Set(chosen.length > 0 ? chosen : shown);
}

export function waitTargets(
  notes: readonly PerfNote[],
  mine: (note: PerfNote) => boolean,
  transpose: number,
): WaitTarget[] {
  const targets: WaitTarget[] = [];
  for (const group of onsetGroups(notes.filter(mine))) {
    const first = group[0];
    if (!first) continue;
    const pitches = [...new Set(group.map((n) => n.pitch + transpose))].sort((a, b) => a - b);
    targets.push({ at: first.start, pitches });
  }
  return targets;
}

const noStats = (): WaitStats => ({ targets: 0, notes: 0, right: 0, wrong: 0, waitedMs: 0 });

export class WaitSession {
  private targets: readonly WaitTarget[] = [];
  private cursor = 0;
  private pressed = new Map<number, number>();
  private readonly down = new Set<number>();
  private clean = true;
  private arrivedAt: number | null = null;
  private totals = noStats();
  private version = 0;
  private readonly listeners = new Set<() => void>();
  finished = false;

  constructor(private readonly clock: () => number = () => performance.now()) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

  private changed(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  view(_version?: number, _tick?: number): WaitView {
    return {
      stats: this.snapshot(this.clock()),
      waiting: this.waiting,
      expected: this.remaining(),
      finished: this.finished,
    };
  }

  get waiting(): boolean {
    return this.arrivedAt !== null;
  }

  limit(): number | null {
    return this.targets[this.cursor]?.at ?? null;
  }

  remaining(): number[] {
    const target = this.targets[this.cursor];
    if (!target || !this.waiting) return [];
    return target.pitches.filter((p) => !this.pressed.has(p));
  }

  setTargets(targets: readonly WaitTarget[], song: number, now: number): void {
    this.targets = targets;
    this.jumpTo(song, now);
    console.info('dewidebug wait-for-me targets', { count: targets.length, from: song });
    this.changed();
  }

  jumpTo(song: number, now: number): void {
    this.suspend(now);
    const index = this.targets.findIndex((t) => t.at >= song - SEEK_SLACK);
    this.cursor = index < 0 ? this.targets.length : index;
    this.pressed.clear();
    this.clean = true;
    console.info('dewidebug wait-for-me cursor', {
      song,
      cursor: this.cursor,
      next: this.limit(),
    });
    this.changed();
  }

  arrive(now: number): void {
    if (this.waiting || !this.targets[this.cursor]) return;
    this.arrivedAt = now;
    console.info('dewidebug wait-for-me waiting', {
      at: this.limit(),
      needs: this.targets[this.cursor]?.pitches,
    });
    this.changed();
  }

  suspend(now: number): void {
    if (this.arrivedAt === null) return;
    this.totals.waitedMs += Math.max(0, now - this.arrivedAt);
    this.arrivedAt = null;
    this.changed();
  }

  release(pitch: number): void {
    this.down.delete(pitch);
  }

  press(pitch: number, now: number, position: number): PressOutcome {
    this.down.add(pitch);
    const target = this.targets[this.cursor];
    if (!target) return { kind: 'ignored', why: 'nothing-to-play' };
    if (!this.waiting && target.at - position > EARLY_SECONDS) {
      console.info('dewidebug wait-for-me press ignored: too early', {
        pitch,
        target: target.at,
        position,
      });
      return { kind: 'ignored', why: 'too-early' };
    }
    for (const [p, at] of this.pressed)
      if (now - at > CHORD_WINDOW_MS && !this.down.has(p)) this.pressed.delete(p);
    if (!target.pitches.includes(pitch)) {
      this.totals.wrong += 1;
      this.clean = false;
      console.info('dewidebug wait-for-me wrong note', {
        pitch,
        needs: target.pitches,
        at: target.at,
        wrong: this.totals.wrong,
      });
      this.changed();
      return { kind: 'wrong' };
    }
    this.pressed.set(pitch, now);
    const done = target.pitches.every((p) => this.pressed.has(p));
    if (done) this.complete(target, now);
    this.changed();
    return { kind: 'correct', done };
  }

  reset(): void {
    this.totals = noStats();
    this.pressed.clear();
    this.down.clear();
    this.clean = true;
    this.arrivedAt = null;
    this.finished = false;
    console.info('dewidebug wait-for-me stats reset');
    this.changed();
  }

  finish(now: number): void {
    this.suspend(now);
    this.finished = true;
    console.info('dewidebug wait-for-me finished', this.snapshot(now));
    this.changed();
  }

  snapshot(now: number): WaitStats {
    const extra = this.arrivedAt === null ? 0 : Math.max(0, now - this.arrivedAt);
    return { ...this.totals, waitedMs: this.totals.waitedMs + extra };
  }

  private complete(target: WaitTarget, now: number): void {
    this.suspend(now);
    this.totals.targets += 1;
    this.totals.notes += target.pitches.length;
    if (this.clean) this.totals.right += target.pitches.length;
    console.info('dewidebug wait-for-me target done', {
      at: target.at,
      notes: target.pitches.length,
      firstTime: this.clean,
    });
    this.cursor += 1;
    this.pressed.clear();
    this.clean = true;
  }
}
