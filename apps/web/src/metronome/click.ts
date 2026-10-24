export type ClickKind = 'bar' | 'beat' | 'sub';

const PITCH: Record<ClickKind, number> = { bar: 1760, beat: 1175, sub: 784 };
const LEVEL: Record<ClickKind, number> = { bar: 0.9, beat: 0.6, sub: 0.3 };

export function playClick(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  kind: ClickKind,
  volume = 1,
): AudioScheduledSourceNode {
  const t = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = PITCH[kind];
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, LEVEL[kind] * volume), t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(gain).connect(destination);
  osc.start(t);
  osc.stop(t + 0.07);
  return osc;
}

export function beatTicks(n: number, d: number, ticksPerQuarter: number): number {
  const unit = (4 / d) * ticksPerQuarter;
  return d >= 8 && n % 3 === 0 && n > 3 ? unit * 3 : unit;
}
