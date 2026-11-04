import type { Groove, MetronomeSettings, Subdivision } from '@pcaa/shared';

export type DrumVoice = 'kick' | 'snare' | 'rim' | 'hat' | 'openHat' | 'ride';

export const TWELFTHS_PER_BEAT = 12;
export const ACCENT_GAIN = 1.25;

export interface DrumHit {
  voice: DrumVoice;
  level: number;
  twelfths: number;
}

export interface DrumSlot {
  beat: number;
  sub: number;
  subdivision: Subdivision;
}

interface GrooveHit {
  beat: number;
  at: number;
  voice: DrumVoice;
  level: number;
}

interface HatRule {
  voice: DrumVoice;
  strong: number;
  beat: number;
  sub: number;
  strongBeats: readonly number[];
  swing: boolean;
}

export interface GrooveSpec {
  beats: number;
  hat: HatRule;
  hits: readonly GrooveHit[];
}

const hit = (beat: number, at: number, voice: DrumVoice, level: number): GrooveHit => ({
  beat,
  at,
  voice,
  level,
});

export const GROOVE_SPECS: Record<Groove, GrooveSpec> = {
  rock: {
    beats: 4,
    hat: { voice: 'hat', strong: 0.5, beat: 0.4, sub: 0.25, strongBeats: [0], swing: false },
    hits: [
      hit(0, 0, 'kick', 0.8),
      hit(1, 0, 'snare', 0.75),
      hit(2, 0, 'kick', 0.7),
      hit(2, 6, 'kick', 0.6),
      hit(3, 0, 'snare', 0.75),
    ],
  },
  ballad: {
    beats: 4,
    hat: { voice: 'hat', strong: 0.3, beat: 0.25, sub: 0.15, strongBeats: [0], swing: false },
    hits: [
      hit(0, 0, 'kick', 0.7),
      hit(1, 0, 'rim', 0.6),
      hit(2, 6, 'kick', 0.45),
      hit(3, 0, 'rim', 0.6),
    ],
  },
  waltz: {
    beats: 3,
    hat: { voice: 'hat', strong: 0.5, beat: 0.35, sub: 0.2, strongBeats: [0], swing: false },
    hits: [hit(0, 0, 'kick', 0.8), hit(1, 0, 'snare', 0.5), hit(2, 0, 'snare', 0.5)],
  },
  sixeight: {
    beats: 6,
    hat: { voice: 'hat', strong: 0.5, beat: 0.35, sub: 0.2, strongBeats: [0, 3], swing: false },
    hits: [hit(0, 0, 'kick', 0.8), hit(3, 0, 'snare', 0.75), hit(5, 0, 'openHat', 0.4)],
  },
  swing: {
    beats: 4,
    hat: { voice: 'ride', strong: 0.5, beat: 0.45, sub: 0.35, strongBeats: [0], swing: true },
    hits: [
      hit(0, 0, 'kick', 0.5),
      hit(1, 0, 'hat', 0.55),
      hit(2, 0, 'kick', 0.35),
      hit(3, 0, 'hat', 0.55),
    ],
  },
  bossa: {
    beats: 4,
    hat: { voice: 'hat', strong: 0.4, beat: 0.3, sub: 0.2, strongBeats: [0], swing: false },
    hits: [
      hit(0, 0, 'kick', 0.7),
      hit(0, 0, 'rim', 0.55),
      hit(1, 6, 'kick', 0.55),
      hit(1, 6, 'rim', 0.55),
      hit(2, 0, 'kick', 0.6),
      hit(3, 0, 'rim', 0.55),
      hit(3, 6, 'kick', 0.55),
    ],
  },
};

const SWUNG_OFFBEAT = 8;

function hatHit(rule: HatRule, beatInGroove: number, slot: DrumSlot): DrumHit | null {
  const { sub, subdivision } = slot;
  if (rule.swing && subdivision === 3 && sub === 1) return null;
  let level = rule.sub;
  if (sub === 0) level = rule.strongBeats.includes(beatInGroove) ? rule.strong : rule.beat;
  const swung = rule.swing && subdivision === 2 && sub === 1;
  const step = TWELFTHS_PER_BEAT / subdivision;
  return { voice: rule.voice, level, twelfths: swung ? SWUNG_OFFBEAT - step : 0 };
}

export function drumHits(
  groove: Groove,
  slot: DrumSlot,
  accent: boolean,
  withHat = true,
): DrumHit[] {
  const spec = GROOVE_SPECS[groove];
  const beatInGroove = slot.beat % spec.beats;
  const step = TWELFTHS_PER_BEAT / slot.subdivision;
  const hits: DrumHit[] = [];
  for (const h of spec.hits) {
    if (h.beat !== beatInGroove) continue;
    const tickSub = Math.floor(h.at / step);
    if (tickSub !== slot.sub) continue;
    hits.push({ voice: h.voice, level: h.level, twelfths: h.at - tickSub * step });
  }
  const hat = withHat ? hatHit(spec.hat, beatInGroove, slot) : null;
  if (hat && !hits.some((h) => h.voice === 'openHat' && h.twelfths === 0)) hits.push(hat);
  return accent ? hits.map((h) => ({ ...h, level: h.level * ACCENT_GAIN })) : hits;
}

export function pickGroove(groove: Groove): Pick<MetronomeSettings, 'groove' | 'beatsPerBar'> {
  return { groove, beatsPerBar: GROOVE_SPECS[groove].beats };
}

export function grooveForMeter(beatsInBar: number, compound: boolean): Groove {
  if (compound && beatsInBar === 2) return 'sixeight';
  if (!compound && beatsInBar === 3) return 'waltz';
  return 'rock';
}

export function clickSlot(groove: Groove, beat: number, sub: number, parts: number): DrumSlot {
  if (groove === 'sixeight') return { beat: beat * parts + sub, sub: 0, subdivision: 1 };
  return { beat, sub, subdivision: parts as Subdivision };
}

export function countInHits(accent: boolean): DrumHit[] {
  return [
    { voice: 'rim', level: accent ? 0.8 : 0.55, twelfths: 0 },
    { voice: 'hat', level: accent ? 0.6 : 0.4, twelfths: 0 },
  ];
}

export function hitSeconds(hit: DrumHit, bpm: number): number {
  return (hit.twelfths / TWELFTHS_PER_BEAT) * (60 / bpm);
}
