import type { Hand } from './hands.ts';
import { markTupletEnds, type NotationEvent, type ScoreModel, type ScoreNote } from './model.ts';
import type { PerfNote } from './performance.ts';

const HAND_STAFF: Record<Hand, number> = { right: 0, left: 1 };
const MIDDLE_C = 60;

function noteKey(staff: number, pitch: number, tick: number): string {
  return `${String(staff)}:${String(pitch)}:${String(Math.round(tick))}`;
}

export function scoreHands(
  notes: readonly ScoreNote[],
  perfHands: ReadonlyMap<PerfNote, Hand>,
): Map<string, Hand> {
  const bySource = new Map<ScoreNote, Hand>();
  const played = [...perfHands].sort(([a], [b]) => a.start - b.start);
  for (const [n, hand] of played)
    if (n.source && !bySource.has(n.source)) bySource.set(n.source, hand);
  const hands = new Map<string, Hand>();
  const tiedTo = new Map<string, Hand>();
  for (const n of [...notes].sort((a, b) => a.tick - b.tick)) {
    const key = noteKey(n.staff, n.pitch, n.tick);
    const hand = bySource.get(n) ?? tiedTo.get(key) ?? (n.pitch < MIDDLE_C ? 'left' : 'right');
    hands.set(key, hand);
    if (n.tieForward) tiedTo.set(noteKey(n.staff, n.pitch, n.tick + n.ticks), hand);
  }
  return hands;
}

export function grandStaff(score: ScoreModel, hands: ReadonlyMap<string, Hand>): ScoreModel {
  const notation = score.notation;
  if (!notation) return score;
  const handOf = (e: NotationEvent, pitch: number): Hand =>
    hands.get(noteKey(e.staff, pitch, e.tick)) ?? (pitch < MIDDLE_C ? 'left' : 'right');

  const events: NotationEvent[] = [];
  const groups = new Map<string, NotationEvent[]>();
  for (const e of notation.events) {
    if (e.rest) continue;
    for (const hand of ['right', 'left'] as const) {
      const notes = e.notes.filter((n) => handOf(e, n.pitch) === hand);
      if (notes.length === 0) continue;
      const staff = HAND_STAFF[hand];
      const split: NotationEvent = {
        ...e,
        staff,
        voice: 0,
        tuplet: e.tuplet ? { ...e.tuplet, start: false, stop: false } : null,
        tupletKey: e.tupletKey ? `${String(staff)}:${e.tupletKey}` : null,
        notes,
      };
      events.push(split);
      const key = `${String(e.measure)}|${String(staff)}|${String(e.staff)}:${String(e.voice)}`;
      groups.set(key, [...(groups.get(key) ?? []), split]);
    }
  }

  const lanes = new Map<string, [number, number][][]>();
  let crowded = 0;
  for (const [key, group] of groups) {
    const laneKey = key.split('|').slice(0, 2).join('|');
    const voices = lanes.get(laneKey) ?? [];
    const spans = group
      .filter((e) => !e.grace)
      .map((e): [number, number] => [e.tick, e.tick + e.ticks]);
    const fits = (taken: [number, number][]) =>
      spans.every(([a, b]) => taken.every(([c, d]) => b <= c || a >= d));
    let voice = voices.findIndex(fits);
    if (voice === -1) {
      voice = voices.length;
      voices.push([]);
    }
    if (voice > 3) crowded += 1;
    voices[voice]?.push(...spans);
    lanes.set(laneKey, voices);
    for (const e of group) e.voice = voice;
  }
  if (crowded > 0)
    console.warn('dewidebug grand staff: more than four voices in a bar', { crowded });

  for (const m of score.measures) {
    for (const staff of [0, 1]) {
      if (events.some((e) => e.staff === staff && e.measure === m.index)) continue;
      events.push({
        staff,
        voice: 0,
        measure: m.index,
        tick: m.tick,
        ticks: m.ticks,
        type: '',
        dots: 0,
        rest: true,
        measureRest: true,
        grace: null,
        tuplet: null,
        tupletKey: null,
        beam: 'auto',
        slurStart: false,
        slurStop: false,
        notes: [],
      });
    }
  }

  markTupletEnds(events);
  const name = score.parts[0]?.name ?? 'Piano';
  console.info('dewidebug grand staff', {
    events: notation.events.length,
    grand: events.length,
    left: events.filter((e) => e.staff === 1 && !e.rest).length,
  });
  return {
    ...score,
    parts: [{ name, staves: [0, 1] }],
    staves: [
      { index: 0, part: 0, name, role: 'right' },
      { index: 1, part: 0, name, role: 'left' },
    ],
    notes: score.notes.map((n) => ({
      ...n,
      staff: HAND_STAFF[hands.get(noteKey(n.staff, n.pitch, n.tick)) ?? 'right'],
    })),
    dynamics: score.dynamics.map((d) => ({ ...d, part: 0 })),
    notation: {
      ...notation,
      events,
      clefs: [
        { staff: 0, tick: 0, clef: 'G' },
        { staff: 1, tick: 0, clef: 'F' },
      ],
    },
  };
}
