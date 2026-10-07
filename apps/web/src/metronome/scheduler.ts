export type Subdivision = 1 | 2 | 3 | 4;

export interface SpeedTrainer {
  enabled: boolean;
  stepBpm: number;
  everyBars: number;
  maxBpm: number;
}

export interface MetronomeSettings {
  bpm: number;
  beatsPerBar: number;
  subdivision: Subdivision;
  accentFirstBeat: boolean;
  trainer: SpeedTrainer;
}

export type TickKind = 'bar' | 'beat' | 'sub';

export interface BeatPosition {
  bar: number;
  beat: number;
  sub: number;
}

export interface Tick {
  time: number;
  bar: number;
  beat: number;
  sub: number;
  kind: TickKind;
  bpm: number;
}

export const MIN_BPM = 20;
export const MAX_BPM = 400;

export const clampBpm = (bpm: number): number =>
  Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));

export const defaultSettings = (): MetronomeSettings => ({
  bpm: 80,
  beatsPerBar: 4,
  subdivision: 1,
  accentFirstBeat: true,
  trainer: { enabled: false, stepBpm: 5, everyBars: 4, maxBpm: 160 },
});

export function bpmForBar(settings: MetronomeSettings, bar: number): number {
  const { trainer } = settings;
  if (!trainer.enabled || trainer.everyBars < 1) return clampBpm(settings.bpm);
  const steps = Math.floor(bar / trainer.everyBars);
  const ceiling = Math.max(settings.bpm, trainer.maxBpm);
  return clampBpm(Math.min(ceiling, settings.bpm + steps * trainer.stepBpm));
}

export class TickScheduler {
  private bar = 0;
  private beat = 0;
  private sub = 0;
  private anchorTime: number;
  private anchorBpm: number;
  private ticksSinceAnchor = 0;
  private readonly settings: MetronomeSettings;

  constructor(settings: MetronomeSettings, startTime: number, from?: BeatPosition) {
    this.settings = settings;
    this.anchorTime = startTime;
    if (from) {
      const beats = Math.max(1, settings.beatsPerBar);
      const crossesBar = from.beat >= beats;
      this.bar = crossesBar ? from.bar + 1 : from.bar;
      this.beat = crossesBar ? 0 : from.beat;
      this.sub = from.sub < settings.subdivision && !crossesBar ? from.sub : 0;
    }
    this.anchorBpm = bpmForBar(settings, this.bar);
  }

  position(): BeatPosition {
    return { bar: this.bar, beat: this.beat, sub: this.sub };
  }

  peekTime(): number {
    return (
      this.anchorTime + (60 * this.ticksSinceAnchor) / (this.anchorBpm * this.settings.subdivision)
    );
  }

  next(): Tick {
    const { beatsPerBar, subdivision, accentFirstBeat } = this.settings;
    let kind: TickKind = 'beat';
    if (this.sub > 0) kind = 'sub';
    else if (this.beat === 0 && accentFirstBeat) kind = 'bar';
    const tick: Tick = {
      time: this.peekTime(),
      bar: this.bar,
      beat: this.beat,
      sub: this.sub,
      kind,
      bpm: this.anchorBpm,
    };

    this.ticksSinceAnchor += 1;
    this.sub += 1;
    if (this.sub >= subdivision) {
      this.sub = 0;
      this.beat += 1;
      if (this.beat >= Math.max(1, beatsPerBar)) {
        this.beat = 0;
        this.bar += 1;
        const bpm = bpmForBar(this.settings, this.bar);
        if (bpm !== this.anchorBpm) {
          this.anchorTime = this.peekTime();
          this.anchorBpm = bpm;
          this.ticksSinceAnchor = 0;
        }
      }
    }
    return tick;
  }

  until(horizon: number): Tick[] {
    const ticks: Tick[] = [];
    while (this.peekTime() < horizon) ticks.push(this.next());
    return ticks;
  }
}
