import { isMidi } from '@pcaa/shared';
import { beatTicks } from '../metronome/click.ts';
import {
  firstPerTick,
  roleFor,
  staffName,
  TPQ,
  uniqueStaffNames,
  type KeyMark,
  type ScoreMeasure,
  type ScoreModel,
  type ScoreNote,
  type ScorePart,
  type ScoreStaff,
  type TempoMark,
} from './model.ts';

const PERCUSSION_CHANNEL = 9;
const MAX_BARS = 5000;
const MAX_TIME_EXPONENT = 6;
const TRACK_NAME_PLACEHOLDER = /^track\s*\d+$/i;

interface RawNote {
  channel: number;
  pitch: number;
  start: number;
  end: number;
  velocity: number;
}

interface RawTrack {
  index: number;
  name: string;
  notes: RawNote[];
  programs: Map<number, number>;
  endTick: number;
}

interface RawMarks {
  tempos: { tick: number; bpm: number }[];
  times: { tick: number; n: number; d: number }[];
  keys: { tick: number; fifths: number; minor: boolean }[];
}

interface Unit {
  name: string;
  notes: RawNote[];
  program: number | null;
}

function cutShort(detail: string): Error {
  return new Error(`This MIDI file is cut short: ${detail}`);
}

function decodeName(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replaceAll('\0', '').trim();
}

export function instrumentOfProgram(program: number): string {
  if (program >= 0 && program <= 7) return 'keyboard.piano';
  if (program >= 24 && program <= 31) return 'pluck.guitar';
  return `midi.program.${String(program)}`;
}

function readTrack(
  data: Uint8Array,
  from: number,
  to: number,
  index: number,
  marks: RawMarks,
): RawTrack {
  let pos = from;
  const byte = (): number => {
    const b = data[pos];
    if (pos >= to || b === undefined) {
      throw cutShort(`track ${String(index + 1)} stops in the middle of an event`);
    }
    pos += 1;
    return b;
  };
  const varLen = (): number => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = byte();
      value = value * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) return value;
    }
    throw new Error(`Track ${String(index + 1)} has a time or length that is too long to be MIDI`);
  };
  const take = (length: number): Uint8Array => {
    if (pos + length > to) {
      throw cutShort(`track ${String(index + 1)} stops in the middle of an event`);
    }
    const slice = data.subarray(pos, pos + length);
    pos += length;
    return slice;
  };

  const track: RawTrack = { index, name: '', notes: [], programs: new Map(), endTick: 0 };
  const open = new Map<number, RawNote[]>();
  let tick = 0;
  let status = 0;
  let ended = false;

  const switchOff = (channel: number, pitch: number) => {
    const queue = open.get(channel * 128 + pitch);
    const note = queue?.shift();
    if (note) note.end = tick;
    else
      console.info('dewidebug midi note-off with nothing sounding', { track: index, tick, pitch });
  };

  while (pos < to && !ended) {
    tick += varLen();
    const first = byte();
    if (first === 0xff) {
      const type = byte();
      const body = take(varLen());
      if (type === 0x2f) ended = true;
      else if (type === 0x03 && track.name === '') track.name = decodeName(body);
      else if (type === 0x51 && body.length === 3) {
        const micros = ((body[0] ?? 0) << 16) | ((body[1] ?? 0) << 8) | (body[2] ?? 0);
        if (micros > 0) {
          marks.tempos.push({ tick, bpm: Math.round((60_000_000 / micros) * 1000) / 1000 });
        }
      } else if (type === 0x58 && body.length >= 2) {
        const n = body[0] ?? 0;
        const exponent = body[1] ?? 2;
        if (n > 0 && exponent <= MAX_TIME_EXPONENT) marks.times.push({ tick, n, d: 2 ** exponent });
      } else if (type === 0x59 && body.length >= 2) {
        const raw = body[0] ?? 0;
        const fifths = raw > 127 ? raw - 256 : raw;
        if (fifths >= -7 && fifths <= 7) marks.keys.push({ tick, fifths, minor: body[1] === 1 });
      }
      continue;
    }
    if (first === 0xf0 || first === 0xf7) {
      take(varLen());
      continue;
    }
    if (first >= 0xf1) {
      throw new Error(
        `Track ${String(index + 1)} has a byte (0x${first.toString(16)}) that MIDI files do not use`,
      );
    }
    let firstData: number | null = null;
    if (first >= 0x80) status = first;
    else if (status === 0) {
      throw new Error(`Track ${String(index + 1)} has data with no status byte before it`);
    } else firstData = first;
    const kind = status >> 4;
    const channel = status & 0x0f;
    const d1 = firstData ?? byte();
    const d2 = kind === 0xc || kind === 0xd ? 0 : byte();
    if (kind === 0x9 && d2 > 0) {
      const note: RawNote = { channel, pitch: d1, start: tick, end: -1, velocity: d2 };
      const key = channel * 128 + d1;
      open.set(key, [...(open.get(key) ?? []), note]);
      track.notes.push(note);
    } else if (kind === 0x8 || kind === 0x9) switchOff(channel, d1);
    else if (kind === 0xc && !track.programs.has(channel)) track.programs.set(channel, d1);
  }
  track.endTick = tick;
  for (const note of track.notes) if (note.end < 0) note.end = tick;
  return track;
}

function toUnits(tracks: RawTrack[], format: number): Unit[] {
  const units: Unit[] = [];
  for (const track of tracks) {
    const notes = track.notes.filter((n) => n.channel !== PERCUSSION_CHANNEL);
    if (notes.length === 0) continue;
    const channels = [...new Set(notes.map((n) => n.channel))].sort((a, b) => a - b);
    const programOf = (cs: number[]) =>
      cs.map((c) => track.programs.get(c)).find((p) => p !== undefined) ?? null;
    if (format === 0 && channels.length > 1) {
      for (const c of channels) {
        units.push({
          name: '',
          notes: notes.filter((n) => n.channel === c),
          program: programOf([c]),
        });
      }
    } else units.push({ name: track.name, notes, program: programOf(channels) });
  }
  return units;
}

function average(notes: readonly RawNote[]): number {
  return notes.reduce((sum, n) => sum + n.pitch, 0) / Math.max(1, notes.length);
}

export function readMidi(data: Uint8Array): ScoreModel {
  if (!isMidi(data)) throw new Error('Not a MIDI file (it does not start with MThd)');
  if (data.length < 14) throw cutShort('the header is incomplete');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(4);
  const format = view.getUint16(8);
  const division = view.getUint16(12);
  if (format > 2) throw new Error(`Unknown MIDI file format ${String(format)}`);
  if (format === 2) {
    throw new Error(
      'MIDI format 2 (independent songs) is not supported; export it as format 0 or 1',
    );
  }
  if ((division & 0x8000) !== 0) {
    throw new Error(
      'This MIDI file counts time in SMPTE frames, which is not supported; export it with ticks per quarter note',
    );
  }
  if (division === 0) throw new Error('This MIDI file has zero ticks per quarter note');
  const scale = TPQ / division;
  const tick = (raw: number) => Math.round(raw * scale);

  const marks: RawMarks = { tempos: [], times: [], keys: [] };
  const tracks: RawTrack[] = [];
  let pos = 8 + headerLength;
  while (pos + 8 <= data.length) {
    const type = String.fromCharCode(...data.subarray(pos, pos + 4));
    const length = view.getUint32(pos + 4);
    const start = pos + 8;
    if (start + length > data.length) {
      throw cutShort(
        `a chunk says it holds ${String(length)} bytes but only ${String(data.length - start)} are left`,
      );
    }
    if (type === 'MTrk') tracks.push(readTrack(data, start, start + length, tracks.length, marks));
    pos = start + length;
  }

  const units = toUnits(tracks, format);
  if (units.length === 0) throw new Error('This MIDI file has no notes to play');

  let ordered = units;
  let parts: ScorePart[];
  const staves: ScoreStaff[] = [];
  const staffUnits: Unit[] = [];
  if (units.length === 2) {
    ordered = [...units].sort((a, b) => average(b.notes) - average(a.notes));
    const [high, low] = ordered;
    const shared = high && low && high.name !== '' && high.name === low.name ? high.name : '';
    const name = shared || 'Piano';
    const program = high?.program ?? low?.program ?? null;
    parts = [
      {
        name,
        staves: [0, 1],
        instrument: program === null ? '' : instrumentOfProgram(program),
      },
    ];
    ordered.forEach((u, position) => {
      staves.push({
        index: position,
        part: 0,
        role: roleFor(2, position),
        name: staffName(name, 2, position),
      });
      staffUnits.push(u);
    });
  } else {
    parts = ordered.map((u, i) => {
      const name = u.name || 'Piano';
      staves.push({ index: i, part: i, role: 'single', name });
      staffUnits.push(u);
      return {
        name,
        staves: [i],
        instrument: u.program === null ? '' : instrumentOfProgram(u.program),
      };
    });
  }
  uniqueStaffNames(staves);

  const title =
    tracks.find(
      (t) => t.notes.length === 0 && t.name !== '' && !TRACK_NAME_PLACEHOLDER.test(t.name),
    )?.name ?? '';

  const lastPerTick = <T extends { tick: number }>(items: T[]): T[] =>
    firstPerTick([...items].sort((a, b) => a.tick - b.tick).reverse());
  const times = lastPerTick(marks.times.map((t) => ({ ...t, tick: tick(t.tick) }))).sort(
    (a, b) => a.tick - b.tick,
  );
  if (times[0]?.tick !== 0) times.unshift({ tick: 0, n: 4, d: 4 });

  let endTick = 0;
  for (const u of staffUnits) {
    for (const n of u.notes) endTick = Math.max(endTick, tick(n.end), tick(n.start) + 1);
  }
  for (const t of tracks) if (t.notes.length === 0) endTick = Math.max(endTick, tick(t.endTick));

  const warnings: string[] = [];
  const measures: ScoreMeasure[] = [];
  let at = 0;
  let sigIndex = 0;
  while ((at < endTick || measures.length === 0) && measures.length < MAX_BARS) {
    while ((times[sigIndex + 1]?.tick ?? Infinity) <= at) sigIndex += 1;
    const sig = times[sigIndex] ?? { tick: 0, n: 4, d: 4 };
    const ticks = Math.max(1, Math.round((sig.n * 4 * TPQ) / sig.d));
    measures.push({
      index: measures.length,
      number: measures.length + 1,
      tick: at,
      ticks,
      startRepeat: false,
      endRepeat: 0,
      markers: [],
      jump: null,
      sectionEnd: false,
      beat: beatTicks(sig.n, sig.d, TPQ),
    });
    at += ticks;
  }
  if (at < endTick) warnings.push(`Only the first ${String(MAX_BARS)} bars are shown`);

  const notes: ScoreNote[] = [];
  let cursor = 0;
  staffUnits.forEach((unit, staff) => {
    for (const n of unit.notes) {
      const start = tick(n.start);
      while (cursor > 0 && (measures[cursor]?.tick ?? 0) > start) cursor -= 1;
      while (cursor + 1 < measures.length && (measures[cursor + 1]?.tick ?? Infinity) <= start) {
        cursor += 1;
      }
      notes.push({
        staff,
        measure: cursor,
        pitch: n.pitch,
        tick: start,
        ticks: Math.max(1, tick(n.end) - start),
        tieForward: false,
        grace: false,
        velocity: n.velocity,
      });
    }
  });
  notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);

  const tempos: TempoMark[] = lastPerTick(marks.tempos.map((t) => ({ ...t, tick: tick(t.tick) })));
  const keys: KeyMark[] = lastPerTick(marks.keys.map((k) => ({ ...k, tick: tick(k.tick) })));
  if (tempos.length === 0) warnings.push('No tempo marking; playing at 120 bpm');

  console.info('dewidebug midi read', {
    format,
    division,
    tracks: tracks.map((t) => ({ name: t.name, notes: t.notes.length })),
    staves: staves.map((s) => s.name),
    percussionNotesSkipped: tracks.reduce(
      (sum, t) => sum + t.notes.filter((n) => n.channel === PERCUSSION_CHANNEL).length,
      0,
    ),
    bars: measures.length,
    notes: notes.length,
    tempos: tempos.length,
    keys: keys.length,
    timeSignatures: times.length,
  });

  return {
    title,
    composer: '',
    format: 'midi',
    version: `SMF format ${String(format)}`,
    parts,
    staves,
    measures,
    voltas: [],
    notes,
    tempos,
    dynamics: [],
    keys,
    notation: null,
    warnings,
  };
}
