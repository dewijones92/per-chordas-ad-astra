import { TickScheduler, type MetronomeSettings, type Tick } from './scheduler.ts';

const LOOKAHEAD_SEC = 0.12;
const PUMP_MS = 25;
const START_DELAY_SEC = 0.06;

const PITCH: Record<Tick['kind'], number> = { bar: 1760, beat: 1175, sub: 784 };
const LEVEL: Record<Tick['kind'], number> = { bar: 0.9, beat: 0.6, sub: 0.3 };

export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private scheduler: TickScheduler | null = null;
  private timer: number | undefined;
  private scheduled: Tick[] = [];
  private ticksPlayed = 0;
  volume = 0.8;

  get running(): boolean {
    return this.scheduler !== null;
  }

  get playedCount(): number {
    return this.ticksPlayed;
  }

  async start(settings: MetronomeSettings): Promise<void> {
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.scheduler = new TickScheduler(settings, this.ctx.currentTime + START_DELAY_SEC);
    this.scheduled = [];
    console.info('dewidebug metronome start', {
      bpm: settings.bpm,
      beatsPerBar: settings.beatsPerBar,
      subdivision: settings.subdivision,
      trainer: settings.trainer.enabled,
      sampleRate: this.ctx.sampleRate,
      baseLatency: this.ctx.baseLatency,
    });
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.pump();
    }, PUMP_MS);
    this.pump();
  }

  retune(settings: MetronomeSettings): void {
    if (!this.scheduler || !this.ctx) return;
    const at = Math.max(this.scheduler.peekTime(), this.ctx.currentTime + START_DELAY_SEC);
    const from = this.scheduler.position();
    this.scheduler = new TickScheduler(settings, at, from);
    console.info('dewidebug metronome retuned in place', { from, bpm: settings.bpm });
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.scheduler = null;
    this.scheduled = [];
    console.info('dewidebug metronome stop', { ticksPlayed: this.ticksPlayed });
  }

  currentTick(): Tick | null {
    if (!this.ctx) return null;
    const now = this.ctx.currentTime;
    let current: Tick | null = null;
    for (const tick of this.scheduled) {
      if (tick.time <= now) current = tick;
      else break;
    }
    this.scheduled = this.scheduled.filter((t) => t.time > now - 1);
    return current;
  }

  private pump(): void {
    if (!this.ctx || !this.scheduler) return;
    for (const tick of this.scheduler.until(this.ctx.currentTime + LOOKAHEAD_SEC)) {
      this.click(tick);
      this.scheduled.push(tick);
      this.ticksPlayed += 1;
    }
  }

  private click(tick: Tick): void {
    if (!this.ctx) return;
    const t = Math.max(tick.time, this.ctx.currentTime);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = PITCH[tick.kind];
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, LEVEL[tick.kind] * this.volume),
      t + 0.002,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }
}
