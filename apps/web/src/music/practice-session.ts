import { Slug, speedPercent, type NewPracticeSession } from '@pcaa/shared';

export const LOG_MIN_MS = 60_000;
export const LOG_IDLE_MS = 120_000;

export class PlayAlongLog {
  private startedAt: number | null = null;
  private runningSince: number | null = null;
  private playedMs = 0;
  private lastActivity = 0;
  private maxSpeed = 0;
  private readonly loops: string[] = [];

  play(now: number, speed: number): void {
    this.startedAt ??= now;
    this.runningSince ??= now;
    this.lastActivity = now;
    this.noteSpeed(speed);
  }

  pause(now: number): void {
    if (this.runningSince !== null) this.playedMs += Math.max(0, now - this.runningSince);
    this.runningSince = null;
    this.lastActivity = now;
  }

  noteSpeed(speed: number): void {
    this.maxSpeed = Math.max(this.maxSpeed, speed);
  }

  noteLoop(label: string): void {
    if (!this.loops.includes(label)) this.loops.push(label);
  }

  played(now: number): number {
    return this.playedMs + (this.runningSince === null ? 0 : Math.max(0, now - this.runningSince));
  }

  due(now: number): boolean {
    return (
      this.runningSince === null &&
      this.played(now) >= LOG_MIN_MS &&
      now - this.lastActivity >= LOG_IDLE_MS
    );
  }

  take(
    now: number,
    target: { pieceId: string; name: string; baseBpm: number | null },
  ): NewPracticeSession | null {
    const played = this.played(now);
    const startedAt = this.startedAt;
    const speed = this.maxSpeed;
    const loops = [...this.loops];
    this.startedAt = null;
    this.runningSince = null;
    this.playedMs = 0;
    this.maxSpeed = 0;
    this.loops.length = 0;
    if (played < LOG_MIN_MS || startedAt === null) return null;
    const bpm = target.baseBpm === null ? null : Math.round(target.baseBpm * speed);
    const looped = loops.length > 0 ? `, looped ${loops.join(', ')}` : '';
    return {
      pieceId: Slug.parse(target.pieceId),
      startedAt: new Date(startedAt).toISOString(),
      durationSec: Math.max(1, Math.round(played / 1000)),
      bpm: bpm !== null && bpm >= 20 && bpm <= 400 ? bpm : null,
      note: `Play-along: ${target.name}${looped}, up to ${String(speedPercent(speed))}% speed`.slice(
        0,
        2000,
      ),
    };
  }
}
