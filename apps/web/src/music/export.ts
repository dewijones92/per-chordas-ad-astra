import { transposeFifths } from './keys.ts';
import { STEP_SEMITONES } from './musicxml.ts';
import type { Performance } from './performance.ts';
import { spell, tpcOf } from './to-musicxml.ts';

const MAX_KEY_FIFTHS = 7;

function firstChild(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.tagName === name) return c;
  return null;
}

function setChild(el: Element, name: string, value: string | null, before: string | null): void {
  let node = firstChild(el, name);
  if (value === null) {
    node?.remove();
    return;
  }
  if (!node) {
    node = el.ownerDocument.createElement(name);
    const anchor = before ? firstChild(el, before) : null;
    el.insertBefore(node, anchor);
  }
  node.textContent = value;
}

function respell(pitch: Element, semitones: number, fifthsShift: number): void {
  const step = (firstChild(pitch, 'step')?.textContent ?? 'C').trim().toUpperCase();
  const alter = Math.round(Number(firstChild(pitch, 'alter')?.textContent ?? 0));
  const octave = Number(firstChild(pitch, 'octave')?.textContent ?? 4);
  const midi = 12 * (octave + 1) + (STEP_SEMITONES[step] ?? 0) + alter + semitones;
  const spelt = spell(midi, tpcOf(step, alter) + fifthsShift);
  setChild(pitch, 'step', spelt.step, null);
  setChild(pitch, 'alter', spelt.alter === 0 ? null : String(spelt.alter), 'octave');
  setChild(pitch, 'octave', String(spelt.octave), null);
}

export function transposeMusicXml(xml: string, semitones: number, fromFifths: number): string {
  if (semitones === 0) return xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0)
    throw new Error('The MusicXML could not be read');
  const shift = transposeFifths(fromFifths, semitones) - fromFifths;
  const shiftFor = (fifths: number) => {
    let to = fifths + shift;
    while (to > MAX_KEY_FIFTHS) to -= 12;
    while (to < -MAX_KEY_FIFTHS) to += 12;
    return to - fifths;
  };
  const keys: number[] = [];
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    let current = shift;
    for (const el of Array.from(part.getElementsByTagName('*'))) {
      if (el.tagName === 'key') {
        const fifths = firstChild(el, 'fifths');
        if (!fifths) continue;
        const from = Number(fifths.textContent) || 0;
        current = shiftFor(from);
        fifths.textContent = String(from + current);
        keys.push(from + current);
      } else if (el.tagName === 'pitch') {
        respell(el, semitones, current);
      }
    }
  }
  for (const accidental of Array.from(doc.getElementsByTagName('accidental'))) accidental.remove();
  console.info('dewidebug export transposed', { semitones, fromFifths, shift, keys });
  return new XMLSerializer().serializeToString(doc);
}

const TICKS_PER_QUARTER = 480;
const FALLBACK_BPM = 120;
const SIGNATURE_DENOMINATORS = [4, 8, 16, 32, 64] as const;
const SIGNATURE_TOLERANCE_TICKS = 2;

function varLen(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function chunk(type: string, body: number[]): number[] {
  const len = body.length;
  return [
    ...Array.from(type).map((c) => c.charCodeAt(0)),
    (len >>> 24) & 0xff,
    (len >>> 16) & 0xff,
    (len >>> 8) & 0xff,
    len & 0xff,
    ...body,
  ];
}

function metaEvent(type: number, data: readonly number[]): number[] {
  return [0xff, type, ...varLen(data.length), ...data];
}

function text(meta: number, value: string): number[] {
  return [0x00, ...metaEvent(meta, Array.from(new TextEncoder().encode(value)))];
}

function signatureOf(ticks: number): { n: number; d: number } {
  for (const d of SIGNATURE_DENOMINATORS) {
    const unit = (4 * TICKS_PER_QUARTER) / d;
    const n = Math.round(ticks / unit);
    if (n >= 1 && n <= 255 && Math.abs(ticks - n * unit) <= SIGNATURE_TOLERANCE_TICKS) {
      return { n, d };
    }
  }
  const finest = (4 * TICKS_PER_QUARTER) / 64;
  return { n: Math.min(255, Math.max(1, Math.round(ticks / finest))), d: 64 };
}

export function performanceToMidi(perf: Performance, transpose: number): Uint8Array {
  const micros = Math.round(60_000_000 / (perf.baseBpm ?? FALLBACK_BPM));
  const ticksPerSecond = (TICKS_PER_QUARTER * 1_000_000) / micros;
  const conductor: { tick: number; bytes: number[] }[] = [
    {
      tick: 0,
      bytes: metaEvent(0x03, Array.from(new TextEncoder().encode(perf.title || 'Play-along'))),
    },
    {
      tick: 0,
      bytes: metaEvent(0x59, [
        transposeFifths(perf.keyFifths, transpose) & 0xff,
        perf.keyMinor ? 1 : 0,
      ]),
    },
    {
      tick: 0,
      bytes: metaEvent(0x51, [(micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]),
    },
  ];
  let signature = '';
  for (const bar of perf.bars) {
    const start = Math.round(bar.start * ticksPerSecond);
    const { n, d } = signatureOf(Math.round(bar.end * ticksPerSecond) - start);
    if (`${String(n)}/${String(d)}` === signature) continue;
    signature = `${String(n)}/${String(d)}`;
    conductor.push({ tick: start, bytes: metaEvent(0x58, [n, Math.log2(d), 24, 8]) });
  }
  const endTick = Math.round((perf.bars.at(-1)?.end ?? perf.duration) * ticksPerSecond);
  const tempoBody: number[] = [];
  let lastTick = 0;
  for (const e of conductor.sort((a, b) => a.tick - b.tick)) {
    tempoBody.push(...varLen(e.tick - lastTick), ...e.bytes);
    lastTick = e.tick;
  }
  tempoBody.push(...varLen(Math.max(0, endTick - lastTick)), ...metaEvent(0x2f, []));
  const tempoTrack = chunk('MTrk', tempoBody);
  const tracks = perf.staves.map((staff, index) => {
    const channel = index < 9 ? index : Math.min(15, index + 1);
    const events: { tick: number; bytes: number[] }[] = [];
    for (const n of perf.notes) {
      if (n.staff !== staff.index) continue;
      const pitch = Math.min(127, Math.max(0, n.pitch + transpose));
      const velocity = Math.min(127, Math.max(1, Math.round(n.velocity)));
      events.push({
        tick: Math.round(n.start * ticksPerSecond),
        bytes: [0x90 | channel, pitch, velocity],
      });
      events.push({
        tick: Math.round(n.end * ticksPerSecond),
        bytes: [0x80 | channel, pitch, 0],
      });
    }
    events.sort((a, b) => a.tick - b.tick || (a.bytes[0] ?? 0) - (b.bytes[0] ?? 0));
    const body: number[] = [...text(0x03, staff.name), 0x00, 0xc0 | channel, 0x00];
    let last = 0;
    for (const e of events) {
      body.push(...varLen(e.tick - last), ...e.bytes);
      last = e.tick;
    }
    body.push(0x00, 0xff, 0x2f, 0x00);
    return chunk('MTrk', body);
  });
  const header = chunk('MThd', [
    0x00,
    0x01,
    0x00,
    tracks.length + 1,
    (TICKS_PER_QUARTER >> 8) & 0xff,
    TICKS_PER_QUARTER & 0xff,
  ]);
  return new Uint8Array([...header, ...tempoTrack, ...tracks.flat()]);
}

export function exportName(name: string, transpose: number, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'score';
  const shift = transpose === 0 ? '' : ` (${transpose > 0 ? '+' : ''}${String(transpose)})`;
  return `${base}${shift}.${extension}`;
}

export function download(name: string, content: string | Uint8Array, type: string): void {
  const part: BlobPart = typeof content === 'string' ? content : new Uint8Array(content);
  const url = URL.createObjectURL(new Blob([part], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
  console.info('dewidebug export downloaded', {
    name,
    type,
    bytes: typeof content === 'string' ? content.length : content.byteLength,
  });
}
