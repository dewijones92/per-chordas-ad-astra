import { PLAY_ALONG_MAX_SPEED, PLAY_ALONG_MIN_SPEED } from '@pcaa/shared';
export interface Timed {
  start: number;
  end: number;
}

export interface Loop {
  start: number;
  end: number;
}

export interface Anchor {
  ctx: number;
  song: number;
  speed: number;
}

export interface Ramp {
  step: number;
  target: number;
}

export interface Scheduled<T extends Timed = Timed> {
  note: T;
  when: number;
  duration: number;
}

export const START_LEAD_SECONDS = 0.06;
export function clampSpeed(speed: number): number {
  return Math.min(PLAY_ALONG_MAX_SPEED, Math.max(PLAY_ALONG_MIN_SPEED, speed));
}

function firstAtOrAfter(notes: readonly Timed[], song: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((notes[mid]?.start ?? Infinity) < song - 1e-6) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class Transport<T extends Timed = Timed> {
  private anchors: Anchor[] = [];
  private paused = 0;
  private cursor = 0;
  private scheduledUntil = 0;
  private startsAt = 0;
  private wholePass: number | null = null;
  private passes: { ctx: number; speed: number }[] = [];
  playing = false;
  speed = 1;
  loop: Loop | null = null;
  ramp: Ramp | null = null;

  constructor(
    private readonly notes: readonly T[],
    private readonly duration: number,
  ) {}

  songAt(ctx: number): number {
    if (!this.playing) return this.paused;
    let anchor = this.anchors[0];
    for (const a of this.anchors) if (a.ctx <= ctx) anchor = a;
    if (!anchor) return this.paused;
    const song = anchor.song + Math.max(0, ctx - anchor.ctx) * anchor.speed;
    return this.loop ? song : Math.min(song, this.duration);
  }

  startPoint(): number {
    let from = this.paused >= this.duration - 1e-3 ? 0 : this.paused;
    if (this.loop && (from < this.loop.start || from >= this.loop.end)) from = this.loop.start;
    return from;
  }

  play(ctx: number): void {
    if (this.playing) return;
    const from = this.startPoint();
    this.playing = true;
    this.startsAt = ctx + START_LEAD_SECONDS;
    this.restartAt(from, this.startsAt, ctx);
  }

  pause(ctx: number): void {
    if (!this.playing) return;
    this.paused = this.songAt(ctx);
    this.playing = false;
    this.anchors = [];
    this.passes = [];
    this.wholePass = null;
  }

  seek(song: number, ctx: number): void {
    const target = Math.min(Math.max(0, song), this.duration);
    if (!this.playing) {
      this.paused = target;
      return;
    }
    this.restartAt(target, Math.max(ctx + START_LEAD_SECONDS, this.startsAt), ctx);
  }

  speedAt(ctx: number): number {
    let anchor = this.anchors[0];
    for (const a of this.anchors) if (a.ctx <= ctx) anchor = a;
    return anchor?.speed ?? this.speed;
  }

  setSpeed(speed: number, ctx: number): boolean {
    const next = clampSpeed(speed);
    if (Math.abs(next - this.speed) < 1e-9) return false;
    const now = this.songAt(ctx);
    this.speed = next;
    if (this.playing) this.restartAt(now, Math.max(ctx, this.startsAt), ctx);
    return true;
  }

  setLoop(loop: Loop | null, ctx: number): void {
    this.loop = loop && loop.end > loop.start ? loop : null;
    if (!this.playing) {
      if (this.loop && (this.paused < this.loop.start || this.paused >= this.loop.end)) {
        this.paused = this.loop.start;
      }
      return;
    }
    const now = this.songAt(ctx);
    const inside = this.loop ? now >= this.loop.start && now < this.loop.end : true;
    this.restartAt(inside ? now : (this.loop?.start ?? now), Math.max(ctx, this.startsAt), ctx);
  }

  finished(ctx: number): boolean {
    return this.playing && !this.loop && this.songAt(ctx) >= this.duration;
  }

  pump(ctx: number, horizon: number, include: (note: T) => boolean): Scheduled<T>[] {
    if (!this.playing) return [];
    const out: Scheduled<T>[] = [];
    const until = ctx + horizon;
    let guard = 0;
    while (this.scheduledUntil < until && guard++ < 64) {
      const anchor = this.anchors.at(-1);
      if (!anchor) break;
      const songFrom = anchor.song + (this.scheduledUntil - anchor.ctx) * anchor.speed;
      let songTo = anchor.song + (until - anchor.ctx) * anchor.speed;
      const loop = this.loop;
      const wraps = loop !== null && songTo >= loop.end;
      if (wraps) songTo = loop.end;
      while (this.cursor < this.notes.length) {
        const note = this.notes[this.cursor];
        if (!note || note.start >= songTo - 1e-9) break;
        this.cursor += 1;
        if (note.start < songFrom - 1e-9 || !include(note)) continue;
        const end = loop ? Math.min(note.end, loop.end) : note.end;
        out.push({
          note,
          when: anchor.ctx + (note.start - anchor.song) / anchor.speed,
          duration: Math.max(0.02, (end - note.start) / anchor.speed),
        });
      }
      if (wraps) {
        const wrapCtx = anchor.ctx + (loop.end - anchor.song) / anchor.speed;
        const speed = this.ramp
          ? Math.max(
              anchor.speed,
              Math.min(this.ramp.target, Math.round((anchor.speed + this.ramp.step) * 100) / 100),
            )
          : anchor.speed;
        this.speed = speed;
        if (this.wholePass !== null) this.passes.push({ ctx: wrapCtx, speed: this.wholePass });
        this.wholePass = speed;
        this.anchors.push({ ctx: wrapCtx, song: loop.start, speed });
        this.anchors = this.anchors.filter((a, i, all) => i >= all.length - 3 || a.ctx > ctx - 1);
        this.cursor = firstAtOrAfter(this.notes, loop.start);
        this.scheduledUntil = wrapCtx;
      } else {
        this.scheduledUntil = until;
      }
    }
    return out;
  }

  takePasses(ctx: number): number[] {
    const done = this.passes.filter((p) => p.ctx <= ctx);
    this.passes = this.passes.filter((p) => p.ctx > ctx);
    return done.map((p) => p.speed);
  }

  private restartAt(song: number, ctx: number, now: number): void {
    this.passes = this.passes.filter((p) => p.ctx <= now);
    this.wholePass = this.loop && Math.abs(song - this.loop.start) < 1e-9 ? this.speed : null;
    this.anchors = [{ ctx, song, speed: this.speed }];
    this.cursor = firstAtOrAfter(this.notes, song);
    this.scheduledUntil = ctx;
    this.paused = song;
  }
}
