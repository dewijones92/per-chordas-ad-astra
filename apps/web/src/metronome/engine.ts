import { playClick } from './click.ts';
import { drumHits, hitSeconds } from '../drums/grooves.ts';
import { playDrum } from '../drums/voices.ts';
import { TickScheduler, type MetronomeSettings, type Tick } from './scheduler.ts';

const LOOKAHEAD_SEC = 0.12;
const PUMP_MS = 25;
const START_DELAY_SEC = 0.06;

export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private scheduler: TickScheduler | null = null;
  private timer: number | undefined;
  private scheduled: Tick[] = [];
  private ticksPlayed = 0;
  private settings: MetronomeSettings | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private drumStats = { hits: 0, silentTicks: 0 };
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
    this.settings = settings;
    this.scheduled = [];
    this.drumStats = { hits: 0, silentTicks: 0 };
    console.info('dewidebug metronome start', {
      bpm: settings.bpm,
      beatsPerBar: settings.beatsPerBar,
      subdivision: settings.subdivision,
      sound: settings.sound,
      groove: settings.sound === 'drums' ? settings.groove : null,
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
    if (
      this.settings &&
      (this.settings.sound !== settings.sound || this.settings.groove !== settings.groove)
    )
      console.info('dewidebug metronome sound changed while running', {
        from: { sound: this.settings.sound, groove: this.settings.groove },
        to: { sound: settings.sound, groove: settings.groove },
      });
    this.settings = settings;
    console.info('dewidebug metronome retuned in place', {
      from,
      bpm: settings.bpm,
      beatsPerBar: settings.beatsPerBar,
      subdivision: settings.subdivision,
    });
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.scheduler = null;
    this.scheduled = [];
    const ringing = this.voices.size;
    for (const node of this.voices) {
      try {
        node.stop();
      } catch (error) {
        console.info('dewidebug metronome drum voice already stopped', { error: String(error) });
      }
    }
    this.voices.clear();
    console.info('dewidebug metronome stop', {
      ticksPlayed: this.ticksPlayed,
      drumHits: this.drumStats.hits,
      silentDrumTicks: this.drumStats.silentTicks,
      voicesCut: ringing,
    });
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
    const ctx = this.ctx;
    if (!ctx) return;
    const settings = this.settings;
    if (settings?.sound !== 'drums') {
      playClick(ctx, ctx.destination, tick.time, tick.kind, this.volume);
      return;
    }
    const hits = drumHits(
      settings.groove,
      { beat: tick.beat, sub: tick.sub, subdivision: settings.subdivision },
      tick.kind === 'bar',
    );
    if (hits.length === 0) this.drumStats.silentTicks += 1;
    for (const hit of hits) {
      this.drumStats.hits += 1;
      for (const node of playDrum(
        ctx,
        ctx.destination,
        tick.time + hitSeconds(hit, tick.bpm),
        hit.voice,
        hit.level * this.volume,
      )) {
        this.voices.add(node);
        node.addEventListener('ended', () => {
          this.voices.delete(node);
        });
      }
    }
  }
}
