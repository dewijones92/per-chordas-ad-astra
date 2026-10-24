import { transposeFifths } from './keys.ts';
import type { Performance } from './performance.ts';

const STEP_FIFTHS: Readonly<Record<string, number>> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const STEPS_BY_FIFTH = 'FCGDAEB';
const STEP_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

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

export function transposeMusicXml(xml: string, semitones: number, fromFifths: number): string {
  if (semitones === 0) return xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0)
    throw new Error('The MusicXML could not be read');
  const shift = transposeFifths(fromFifths, semitones) - fromFifths;
  for (const key of Array.from(doc.getElementsByTagName('key'))) {
    const fifths = firstChild(key, 'fifths');
    if (fifths)
      fifths.textContent = String(transposeFifths(Number(fifths.textContent) || 0, semitones));
  }
  for (const pitch of Array.from(doc.getElementsByTagName('pitch'))) {
    const step = (firstChild(pitch, 'step')?.textContent ?? 'C').trim().toUpperCase();
    const alter = Math.round(Number(firstChild(pitch, 'alter')?.textContent ?? 0));
    const octave = Number(firstChild(pitch, 'octave')?.textContent ?? 4);
    const midi = 12 * (octave + 1) + (STEP_PC[step] ?? 0) + alter + semitones;
    const line = (STEP_FIFTHS[step] ?? 0) + 7 * alter + shift;
    const newStep = STEPS_BY_FIFTH[(((line + 1) % 7) + 7) % 7] ?? 'C';
    const newAlter = Math.floor((line + 1) / 7);
    const newOctave = Math.floor((midi - newAlter - (STEP_PC[newStep] ?? 0)) / 12) - 1;
    setChild(pitch, 'step', newStep, null);
    setChild(pitch, 'alter', newAlter === 0 ? null : String(newAlter), 'octave');
    setChild(pitch, 'octave', String(newOctave), null);
  }
  for (const accidental of Array.from(doc.getElementsByTagName('accidental'))) accidental.remove();
  return new XMLSerializer().serializeToString(doc);
}

const TICKS_PER_QUARTER = 480;
const EXPORT_BPM = 120;
const TICKS_PER_SECOND = (TICKS_PER_QUARTER * EXPORT_BPM) / 60;

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

function text(meta: number, value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  return [0x00, 0xff, meta, ...varLen(bytes.length), ...bytes];
}

export function performanceToMidi(perf: Performance, transpose: number): Uint8Array {
  const micros = Math.round(60_000_000 / EXPORT_BPM);
  const tempoTrack = chunk('MTrk', [
    ...text(0x03, perf.title || 'Play-along'),
    0x00,
    0xff,
    0x51,
    0x03,
    (micros >> 16) & 0xff,
    (micros >> 8) & 0xff,
    micros & 0xff,
    0x00,
    0xff,
    0x2f,
    0x00,
  ]);
  const tracks = perf.staves.map((staff, index) => {
    const channel = index < 9 ? index : Math.min(15, index + 1);
    const events: { tick: number; bytes: number[] }[] = [];
    for (const n of perf.notes) {
      if (n.staff !== staff.index) continue;
      const pitch = Math.min(127, Math.max(0, n.pitch + transpose));
      const velocity = Math.min(127, Math.max(1, Math.round(n.velocity)));
      events.push({
        tick: Math.round(n.start * TICKS_PER_SECOND),
        bytes: [0x90 | channel, pitch, velocity],
      });
      events.push({
        tick: Math.round(n.end * TICKS_PER_SECOND),
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
