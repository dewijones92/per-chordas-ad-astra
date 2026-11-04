import type { DrumVoice } from './grooves.ts';

const FLOOR = 0.0001;
const NOISE_SECONDS = 1;
const noise = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noise.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.set(ctx, buffer);
  }
  return buffer;
}

function envelope(gain: GainNode, t: number, peak: number, decay: number): void {
  gain.gain.setValueAtTime(FLOOR, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(FLOOR * 2, peak), t + 0.002);
  gain.gain.exponentialRampToValueAtTime(FLOOR, t + decay);
}

function tone(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  spec: {
    type: OscillatorType;
    from: number;
    to: number;
    drop: number;
    peak: number;
    decay: number;
  },
): AudioScheduledSourceNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.from, t);
  osc.frequency.exponentialRampToValueAtTime(spec.to, t + spec.drop);
  envelope(gain, t, spec.peak, spec.decay);
  osc.connect(gain).connect(destination);
  osc.start(t);
  osc.stop(t + spec.decay + 0.02);
  return osc;
}

function hiss(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  spec: { filter: BiquadFilterType; hz: number; q: number; peak: number; decay: number },
): AudioScheduledSourceNode {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noiseBuffer(ctx);
  filter.type = spec.filter;
  filter.frequency.value = spec.hz;
  filter.Q.value = spec.q;
  envelope(gain, t, spec.peak, spec.decay);
  src.connect(filter).connect(gain).connect(destination);
  src.start(t);
  src.stop(t + spec.decay + 0.02);
  return src;
}

export function playDrum(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  voice: DrumVoice,
  level: number,
): AudioScheduledSourceNode[] {
  const t = Math.max(when, ctx.currentTime);
  switch (voice) {
    case 'kick':
      return [
        tone(ctx, destination, t, {
          type: 'sine',
          from: 150,
          to: 45,
          drop: 0.12,
          peak: level,
          decay: 0.32,
        }),
      ];
    case 'snare':
      return [
        hiss(ctx, destination, t, {
          filter: 'highpass',
          hz: 1800,
          q: 0.7,
          peak: level * 0.8,
          decay: 0.2,
        }),
        tone(ctx, destination, t, {
          type: 'triangle',
          from: 220,
          to: 160,
          drop: 0.06,
          peak: level * 0.6,
          decay: 0.11,
        }),
      ];
    case 'rim':
      return [
        tone(ctx, destination, t, {
          type: 'square',
          from: 1700,
          to: 1500,
          drop: 0.01,
          peak: level * 0.35,
          decay: 0.03,
        }),
        hiss(ctx, destination, t, {
          filter: 'bandpass',
          hz: 3200,
          q: 1.5,
          peak: level * 0.5,
          decay: 0.04,
        }),
      ];
    case 'hat':
      return [
        hiss(ctx, destination, t, {
          filter: 'highpass',
          hz: 7500,
          q: 0.7,
          peak: level * 0.5,
          decay: 0.05,
        }),
      ];
    case 'openHat':
      return [
        hiss(ctx, destination, t, {
          filter: 'highpass',
          hz: 7000,
          q: 0.7,
          peak: level * 0.45,
          decay: 0.32,
        }),
      ];
    case 'ride':
      return [
        hiss(ctx, destination, t, {
          filter: 'highpass',
          hz: 5500,
          q: 0.9,
          peak: level * 0.4,
          decay: 0.28,
        }),
        tone(ctx, destination, t, {
          type: 'sine',
          from: 3100,
          to: 3000,
          drop: 0.05,
          peak: level * 0.18,
          decay: 0.18,
        }),
      ];
  }
}
