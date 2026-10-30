import { countInFor, type PerfClick, type PerfNote, type Performance } from './performance.ts';
import { chooseSample, gainFor, SampleManifest, sampleFile } from './samples.ts';
import { playClick } from '../metronome/click.ts';
import { START_LEAD_SECONDS, Transport, type Loop, type Ramp } from './transport.ts';

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
    .then((json: unknown) => SampleManifest.parse(json))
    .catch((error: unknown) => {
      manifestPromise = null;
      throw error;
    });
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
          })
          .catch((error: unknown) => {
            loading.delete(file);
            throw error;
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
  | { kind: 'loop'; position: number; speed: number };

function keep(nodes: Set<AudioScheduledSourceNode>, node: AudioScheduledSourceNode): void {
  nodes.add(node);
  node.addEventListener('ended', () => {
    nodes.delete(node);
  });
}

function stopAll(nodes: Set<AudioScheduledSourceNode>, at: number): void {
  if (nodes.size > 0) console.info('dewidebug play-along clicks cancelled', { count: nodes.size });
  for (const node of nodes) {
    try {
      node.stop(at);
    } catch (error) {
      console.info('dewidebug play-along click already stopped', { error: String(error) });
    }
  }
  nodes.clear();
}

export class PianoPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private manifest: SampleManifest | null = null;
  private readonly transport: Transport<PerfNote>;
  private readonly clicks: Transport<PerfClick>;
  private clickOn = false;
  private halfBeats = false;
  private readonly perf: Performance;
  private timer: number | undefined;
  private voices = new Set<Voice>();
  private countInClicks = new Set<AudioScheduledSourceNode>();
  private trackClicks = new Set<AudioScheduledSourceNode>();
  private include: (note: PerfNote) => boolean = () => true;
  private transpose = 0;
  private fallbackLogged = false;
  private lastPosition = 0;
  private startRequest = 0;
  private passListener: (speed: number) => void = () => undefined;
  private startingNow = false;

  constructor(
    perf: Performance,
    private readonly onEvent: (event: PlayerEvent) => void,
  ) {
    this.perf = perf;
    this.transport = new Transport(perf.notes, perf.duration);
    this.clicks = new Transport(perf.clicks, perf.duration);
  }

  private both(apply: (t: Transport<PerfNote> | Transport<PerfClick>) => void): void {
    apply(this.transport);
    apply(this.clicks);
  }

  get playing(): boolean {
    return this.transport.playing;
  }

  get starting(): boolean {
    return this.startingNow;
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

  async play(countIn = false): Promise<void> {
    const request = ++this.startRequest;
    this.startingNow = true;
    try {
      await this.prepare();
    } finally {
      if (request === this.startRequest) this.startingNow = false;
    }
    if (request !== this.startRequest) {
      console.info('dewidebug play-along start cancelled while getting ready', { request });
      return;
    }
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const count = countIn
      ? countInFor(this.perf, this.transport.startPoint(), this.transport.speed)
      : null;
    if (count) {
      for (let k = 0; k < count.beats; k++) {
        keep(
          this.countInClicks,
          playClick(
            ctx,
            master,
            now + START_LEAD_SECONDS + k * count.seconds,
            k === 0 ? 'bar' : 'beat',
          ),
        );
      }
    }
    const delay = count ? count.beats * count.seconds : 0;
    this.both((t) => {
      t.play(now + delay);
    });
    this.startPump();
    console.info('dewidebug play-along play', {
      from: this.position().toFixed(2),
      speed: this.transport.speed,
      loop: this.transport.loop,
      transpose: this.transpose,
      countIn: count,
      click: this.clickOn,
      halfBeats: this.halfBeats,
    });
    this.onEvent({ kind: 'state', playing: true });
  }

  pause(): void {
    this.startRequest += 1;
    this.startingNow = false;
    if (!this.ctx || !this.transport.playing) return;
    const at = this.ctx.currentTime;
    this.both((t) => {
      t.pause(at);
    });
    this.stopPump();
    this.silence();
    stopAll(this.countInClicks, at);
    console.info('dewidebug play-along pause', { at: this.position().toFixed(2) });
    this.onEvent({ kind: 'state', playing: false });
  }

  seek(song: number): void {
    const at = this.ctx?.currentTime ?? 0;
    this.both((t) => {
      t.seek(song, at);
    });
    this.lastPosition = song;
    if (this.transport.playing) this.silence();
  }

  setSpeed(speed: number): void {
    const at = this.ctx?.currentTime ?? 0;
    const changed = this.transport.setSpeed(speed, at);
    this.clicks.setSpeed(speed, at);
    if (changed && this.transport.playing) this.silence();
  }

  setPassListener(listener: (speed: number) => void): void {
    this.passListener = listener;
  }

  setClick(on: boolean, halfBeats: boolean): void {
    if (on !== this.clickOn || halfBeats !== this.halfBeats)
      console.info('dewidebug play-along click', { on, halfBeats });
    this.clickOn = on;
    this.halfBeats = halfBeats;
  }

  setRamp(ramp: Ramp | null): void {
    this.transport.ramp = ramp;
    this.clicks.ramp = ramp;
  }

  setLoop(loop: Loop | null): void {
    const at = this.ctx?.currentTime ?? 0;
    this.both((t) => {
      t.setLoop(loop, at);
    });
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
    stopAll(this.countInClicks, this.ctx?.currentTime ?? 0);
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
        this.onEvent({ kind: 'loop', position, speed: this.transport.speedAt(ctx.currentTime) });
      }
      this.lastPosition = position;
      for (const speed of this.transport.takePasses(ctx.currentTime)) {
        console.info('dewidebug play-along whole loop pass', { speed });
        this.passListener(speed);
      }
      if (this.clickOn) {
        const halves = this.halfBeats;
        for (const c of this.clicks.pump(
          ctx.currentTime,
          HORIZON_SECONDS,
          (c) => halves || c.kind !== 'sub',
        )) {
          if (this.master)
            keep(this.trackClicks, playClick(ctx, this.master, c.when, c.note.kind, 0.8));
        }
      } else {
        this.clicks.pump(ctx.currentTime, HORIZON_SECONDS, () => false);
      }
      for (const s of this.transport.pump(ctx.currentTime, HORIZON_SECONDS, this.include)) {
        this.voice(s.note, s.when, s.duration);
      }
      if (this.transport.finished(ctx.currentTime)) {
        const at = ctx.currentTime;
        this.both((t) => {
          t.pause(at);
        });
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
    stopAll(this.trackClicks, now);
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
