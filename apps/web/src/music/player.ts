import type { PerfNote, Performance } from './performance.ts';
import { chooseSample, gainFor, SampleManifest, sampleFile } from './samples.ts';
import { Transport, type Loop } from './transport.ts';

const SAMPLE_BASE = '/piano/';
const PUMP_MS = 25;
const HORIZON_SECONDS = 0.15;
const RELEASE_TIME_CONSTANT = 0.09;

interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  ends: number;
}

let manifestPromise: Promise<SampleManifest> | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<void>>();

function loadManifest(): Promise<SampleManifest> {
  manifestPromise ??= fetch(`${SAMPLE_BASE}manifest.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`${String(r.status)} ${r.statusText}`);
      return r.json();
    })
    .then((json: unknown) => SampleManifest.parse(json));
  return manifestPromise;
}

async function loadLayer(
  ctx: BaseAudioContext,
  manifest: SampleManifest,
  layer: string,
): Promise<void> {
  await Promise.all(
    manifest.pitches.map(async (pitch) => {
      const file = sampleFile(manifest, pitch, layer);
      if (buffers.has(file)) return;
      let pending = loading.get(file);
      if (!pending) {
        pending = fetch(`${SAMPLE_BASE}${file}`)
          .then((r) => {
            if (!r.ok) throw new Error(`${String(r.status)} ${file}`);
            return r.arrayBuffer();
          })
          .then((data) => ctx.decodeAudioData(data))
          .then((buffer) => {
            buffers.set(file, buffer);
          });
        loading.set(file, pending);
      }
      await pending;
    }),
  );
}

export type PlayerEvent =
  | { kind: 'state'; playing: boolean }
  | { kind: 'samples'; loaded: number; total: number; error?: string }
  | { kind: 'ended' }
  | { kind: 'loop'; position: number };

export class PianoPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private manifest: SampleManifest | null = null;
  private readonly transport: Transport;
  private timer: number | undefined;
  private voices = new Set<Voice>();
  private include: (note: PerfNote) => boolean = () => true;
  private transpose = 0;
  private fallbackLogged = false;
  private lastPosition = 0;

  constructor(
    perf: Performance,
    private readonly onEvent: (event: PlayerEvent) => void,
  ) {
    this.transport = new Transport(perf.notes, perf.duration);
  }

  get playing(): boolean {
    return this.transport.playing;
  }

  get speed(): number {
    return this.transport.speed;
  }

  position(): number {
    return this.transport.songAt(this.ctx?.currentTime ?? 0);
  }

  async prepare(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.manifest) return;
    try {
      this.manifest = await loadManifest();
      const manifest = this.manifest;
      const total = manifest.pitches.length * manifest.layers.length;
      const ctx = this.ctx;
      const report = () => {
        this.onEvent({ kind: 'samples', loaded: buffers.size, total });
      };
      const middle = manifest.layers[Math.floor(manifest.layers.length / 2)]?.name ?? '';
      await loadLayer(ctx, manifest, middle);
      report();
      console.info('dewidebug play-along piano samples ready (middle layer)', {
        layer: middle,
        buffers: buffers.size,
      });
      void Promise.all(
        manifest.layers
          .filter((l) => l.name !== middle)
          .map((l) => loadLayer(ctx, manifest, l.name)),
      ).then(report, (error: unknown) => {
        console.warn('dewidebug play-along extra sample layers failed', { error: String(error) });
      });
    } catch (error) {
      console.warn('dewidebug play-along samples unavailable; using a simple synth', {
        error: String(error),
      });
      this.onEvent({ kind: 'samples', loaded: 0, total: 0, error: String(error) });
    }
  }

  async play(): Promise<void> {
    await this.prepare();
    const ctx = this.ctx;
    if (!ctx) return;
    this.transport.play(ctx.currentTime);
    this.startPump();
    console.info('dewidebug play-along play', {
      from: this.position().toFixed(2),
      speed: this.transport.speed,
      loop: this.transport.loop,
      transpose: this.transpose,
    });
    this.onEvent({ kind: 'state', playing: true });
  }

  pause(): void {
    if (!this.ctx || !this.transport.playing) return;
    this.transport.pause(this.ctx.currentTime);
    this.stopPump();
    this.silence();
    console.info('dewidebug play-along pause', { at: this.position().toFixed(2) });
    this.onEvent({ kind: 'state', playing: false });
  }

  seek(song: number): void {
    this.transport.seek(song, this.ctx?.currentTime ?? 0);
    this.lastPosition = Math.min(this.lastPosition, song);
    if (this.transport.playing) this.silence();
  }

  setSpeed(speed: number): void {
    this.transport.setSpeed(speed, this.ctx?.currentTime ?? 0);
    if (this.transport.playing) this.silence();
  }

  setLoop(loop: Loop | null): void {
    this.transport.setLoop(loop, this.ctx?.currentTime ?? 0);
    this.lastPosition = this.position();
    if (this.transport.playing) this.silence();
  }

  setTranspose(semitones: number): void {
    this.transpose = semitones;
    if (this.transport.playing) this.seek(this.position());
  }

  setInclude(include: (note: PerfNote) => boolean): void {
    this.include = include;
    if (this.transport.playing) this.seek(this.position());
  }

  dispose(): void {
    this.stopPump();
    this.silence();
    void this.ctx?.close();
    this.ctx = null;
  }

  private startPump(): void {
    this.stopPump();
    this.lastPosition = this.position();
    const tick = () => {
      const ctx = this.ctx;
      if (!ctx) return;
      const position = this.transport.songAt(ctx.currentTime);
      if (this.transport.loop && position + 0.05 < this.lastPosition) {
        console.info('dewidebug play-along loop wrapped', {
          from: this.lastPosition.toFixed(2),
          to: position.toFixed(2),
        });
        this.onEvent({ kind: 'loop', position });
      }
      this.lastPosition = position;
      for (const s of this.transport.pump(ctx.currentTime, HORIZON_SECONDS, this.include)) {
        this.voice(s.note, s.when, s.duration);
      }
      if (this.transport.finished(ctx.currentTime)) {
        this.transport.pause(ctx.currentTime);
        this.stopPump();
        console.info('dewidebug play-along reached the end');
        this.onEvent({ kind: 'state', playing: false });
        this.onEvent({ kind: 'ended' });
      }
    };
    tick();
    this.timer = window.setInterval(tick, PUMP_MS);
  }

  private stopPump(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private silence(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, 0.015);
      try {
        v.source.stop(now + 0.08);
      } catch (error) {
        console.info('dewidebug play-along voice already stopped', { error: String(error) });
      }
    }
    this.voices.clear();
  }

  private voice(note: PerfNote, when: number, duration: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const pitch = note.pitch + this.transpose;
    const start = Math.max(when, ctx.currentTime);
    const end = start + duration;
    const gain = ctx.createGain();
    const level = gainFor(note.velocity);
    gain.connect(master);
    let source: AudioScheduledSourceNode;
    const manifest = this.manifest;
    const choice = manifest ? chooseSample(manifest, pitch, note.velocity) : null;
    const usable =
      manifest && choice
        ? [choice.layer, ...manifest.layers.map((l) => l.name)]
            .map((layer) => buffers.get(sampleFile(manifest, choice.pitch, layer)))
            .find((b) => b !== undefined)
        : undefined;
    if (usable && choice) {
      const src = ctx.createBufferSource();
      src.buffer = usable;
      src.playbackRate.value = choice.rate;
      gain.gain.setValueAtTime(level, start);
      source = src;
    } else {
      if (!this.fallbackLogged) {
        this.fallbackLogged = true;
        console.info('dewidebug play-along playing with the fallback synth', { pitch });
      }
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level * 0.35, start + 0.005);
      gain.gain.setTargetAtTime(level * 0.12, start + 0.005, 0.4);
      source = osc;
    }
    gain.gain.setTargetAtTime(0, end, RELEASE_TIME_CONSTANT);
    source.connect(gain);
    source.start(start);
    const stopAt = end + RELEASE_TIME_CONSTANT * 6;
    source.stop(stopAt);
    const voice: Voice = { source, gain, ends: stopAt };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      gain.disconnect();
    };
  }
}
