import { chordQuarters, type FixtureScore } from './music.ts';

const DIVISION = 96;
const VELOCITY = 80;
const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

interface TrackEvent {
  tick: number;
  order: number;
  bytes: number[];
}

interface FixtureNote {
  pitch: number;
  start: number;
  end: number;
}

function varLen(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function chunk(type: string, body: number[]): number[] {
  const size = body.length;
  return [
    ...Array.from(type, (c) => c.charCodeAt(0)),
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    ...body,
  ];
}

function meta(type: number, data: number[]): number[] {
  return [0xff, type, ...varLen(data.length), ...data];
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function track(events: TrackEvent[], endTick: number): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const e of sorted) {
    body.push(...varLen(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(...varLen(Math.max(0, endTick - last)), ...meta(0x2f, []));
  return chunk('MTrk', body);
}

export function makeMidi(score: FixtureScore): Uint8Array {
  const [beats, beatType] = score.time;
  const measureTicks = Math.round((beats * 4 * DIVISION) / beatType);
  const endTick = measureTicks * score.measures.length;
  const micros = (bpm: number) => {
    const n = Math.round(60_000_000 / bpm);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  };

  const conductor: TrackEvent[] = [
    { tick: 0, order: 0, bytes: meta(0x03, utf8(score.title)) },
    { tick: 0, order: 1, bytes: meta(0x59, [score.fifths & 0xff, 0]) },
    { tick: 0, order: 2, bytes: meta(0x58, [beats, Math.log2(beatType), 24, 8]) },
    { tick: 0, order: 3, bytes: meta(0x51, micros(score.tempo)) },
  ];
  score.measures.forEach((m, i) => {
    if (m.tempo && i > 0)
      conductor.push({ tick: i * measureTicks, order: 3, bytes: meta(0x51, micros(m.tempo)) });
  });

  const tracks: number[][] = [track(conductor, endTick)];
  let staffIndex = 0;
  for (const part of score.parts) {
    for (let s = 0; s < part.staves; s++) {
      const channel = staffIndex < 9 ? staffIndex : Math.min(15, staffIndex + 1);
      const name = part.staves === 2 ? (['up', 'down'][s] ?? part.name) : part.name;
      const notes: FixtureNote[] = [];
      const tied = new Map<number, FixtureNote>();
      score.measures.forEach((m, mi) => {
        let tick = mi * measureTicks;
        for (const chord of m.staves[staffIndex] ?? []) {
          if (chord.grace) continue;
          const ticks = Math.round(chordQuarters(chord) * DIVISION);
          for (const pitch of chord.pitches ?? []) {
            const note = tied.get(pitch) ?? { pitch, start: tick, end: tick };
            if (!tied.has(pitch)) notes.push(note);
            note.end = tick + ticks;
            if (chord.tie) tied.set(pitch, note);
            else tied.delete(pitch);
          }
          tick += ticks;
        }
      });
      const events: TrackEvent[] = [
        { tick: 0, order: 0, bytes: meta(0x03, utf8(name)) },
        { tick: 0, order: 1, bytes: [0xc0 | channel, 0] },
      ];
      for (const n of notes) {
        events.push({ tick: n.start, order: 3, bytes: [NOTE_ON | channel, n.pitch, VELOCITY] });
        events.push({ tick: n.end, order: 2, bytes: [NOTE_OFF | channel, n.pitch, 0] });
      }
      tracks.push(track(events, endTick));
      staffIndex += 1;
    }
  }

  const header = chunk('MThd', [0, 1, 0, tracks.length, 0, DIVISION]);
  return new Uint8Array([...header, ...tracks.flat()]);
}
