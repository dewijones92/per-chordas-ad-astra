import { describe, expect, it } from 'vitest';
import { drawFalling, fingerOf, geometry, type FallingView } from '../src/music/falling.ts';
import { handColourOf, handLayers } from '../src/music/hand-timelines.ts';
import { poseAt, whiteUnits } from '../src/music/hand-pose.ts';
import { staffColours } from '../src/music/colours.ts';
import { noteKey } from '../src/music/model.ts';
import type { PerfNote, Performance } from '../src/music/performance.ts';
import { sideFor, suggestBySide } from '../src/music/suggest-fingering.ts';

interface Recorded {
  texts: { text: string; y: number }[];
  arcs: { x: number; y: number }[];
  rounds: { x: number; y: number; h: number }[];
  strokes: string[];
  fills: string[];
}

function recordingContext(): { ctx: CanvasRenderingContext2D; seen: Recorded } {
  const seen: Recorded = { texts: [], arcs: [], rounds: [], strokes: [], fills: [] };
  const state: Record<string, unknown> = { font: '' };
  let transformed = 0;
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'fillText')
        return (text: string, _x: number, y: number) => {
          seen.texts.push({ text, y });
        };
      if (prop === 'arc') return (x: number, y: number) => seen.arcs.push({ x, y });
      if (prop === 'roundRect')
        return (x: number, y: number, _w: number, h: number) => {
          if (transformed === 0) seen.rounds.push({ x, y, h });
        };
      if (prop === 'save') return () => (transformed += 1);
      if (prop === 'restore') return () => (transformed -= 1);
      if (prop === 'stroke') return () => seen.strokes.push(String(target['strokeStyle']));
      if (prop === 'fill') return () => seen.fills.push(String(target['fillStyle']));
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 7 });
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value: unknown) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, seen };
}

const note = (pitch: number, start: number, end: number): PerfNote => ({
  pitch,
  start,
  end,
  staff: 0,
  velocity: 80,
  bar: 0,
  grace: false,
});

const withFinger = (n: PerfNote, text: string): PerfNote => ({
  ...n,
  source: {
    staff: 0,
    measure: 0,
    pitch: n.pitch,
    tick: Math.round(n.start * 480),
    ticks: 240,
    tieForward: false,
    grace: false,
    finger: { text, kind: 'piano' },
  },
});

const scale = [60, 62, 64, 65, 67, 69, 71, 72].map((p, i) => note(p, i * 0.5, i * 0.5 + 0.5));
const bass = [48, 52, 55].map((p, i) => note(p, i, i + 0.9));
const RANGE = { low: 36, high: 84 };
const colours = staffColours([
  { index: 0, part: 0, name: 'RH', role: 'right' },
  { index: 1, part: 0, name: 'LH', role: 'left' },
]);

function layersFor(notes: PerfNote[], extra: Partial<Parameters<typeof handLayers>[0]> = {}) {
  const sideOf = (n: PerfNote) => sideFor(undefined, n.pitch, 60);
  return handLayers({
    notes,
    hidden: new Set(),
    laneOf: (n) => (sideOf(n) === 'right' ? 0 : 1),
    sideOf,
    userFingers: new Map(),
    suggested: suggestBySide(notes, sideOf),
    transpose: 0,
    range: RANGE,
    tails: false,
    colourOf: (side) => handColourOf(side, [{ role: 'right' }, { role: 'left' }], colours),
    ...extra,
  });
}

describe('the hand model uses the fingers shown on the notes', () => {
  it('presses, for every note, the finger fingerOf gives it, over that note’s key', () => {
    const notes = [...scale, ...bass].map((n, i) => (i === 2 ? withFinger(n, '4') : n));
    const user = new Map([
      [noteKey(notes[2]?.source ?? { staff: 0, measure: 0, tick: 0, pitch: 0 }), '2'],
    ]);
    const suggested = suggestBySide(notes, (n) => sideFor(undefined, n.pitch, 60));
    const layers = layersFor(notes, { userFingers: user, suggested });
    const unit = whiteUnits(RANGE);
    for (const n of notes) {
      const shown = fingerOf(n, user, suggested);
      const finger = Number(shown?.text);
      const layer = layers.find((l) => l.side === sideFor(undefined, n.pitch, 60));
      expect(layer).toBeDefined();
      if (!layer) continue;
      poseAt(layer.timeline, n.start + 0.02, layer.pose);
      expect(layer.pose.dip[finger - 1]).toBeGreaterThan(0.99);
      expect(layer.pose.u[finger - 1]).toBeCloseTo(unit(n.pitch), 5);
    }
  });

  it('lets a finger you set win over the file’s and the suggestion', () => {
    const only = [withFinger(note(60, 0, 1), '4')];
    const user = new Map([
      [noteKey(only[0]?.source ?? { staff: 0, measure: 0, tick: 0, pitch: 0 }), '2'],
    ]);
    const [layer] = layersFor(only, { userFingers: user });
    if (!layer) throw new Error('no hand');
    poseAt(layer.timeline, 0.5, layer.pose);
    expect(layer.pose.dip[1]).toBe(1);
    expect(layer.pose.dip[3]).toBe(0);
  });

  it('draws no hand for a hidden lane, and none when there are no fingers to go on', () => {
    expect(layersFor(scale, { hidden: new Set([0]) })).toHaveLength(0);
    expect(layersFor(scale, { suggested: null })).toHaveLength(0);
  });

  it('follows a transposition', () => {
    const [up] = layersFor(scale, { transpose: 2 });
    if (!up) throw new Error('no hand');
    poseAt(up.timeline, 0.02, up.pose);
    expect(up.pose.u[0]).toBeCloseTo(whiteUnits(RANGE)(62), 5);
  });
});

function viewOf(notes: PerfNote[], position: number, width = 1000): FallingView {
  const perf: Performance = {
    title: 't',
    notes,
    bars: [],
    clicks: [],
    staves: [],
    duration: 30,
    lowest: 36,
    highest: 84,
    keyFifths: 0,
    keyMinor: false,
    baseBpm: null,
    warnings: [],
  };
  return {
    perf,
    position,
    transpose: 0,
    range: RANGE,
    hidden: new Set(),
    muted: new Set(),
    colours,
    laneOf: (n) => (n.pitch < 60 ? 1 : 0),
    tails: false,
    loop: null,
    names: null,
    lookAhead: 3,
    hands: layersFor(notes),
    width,
    height: 400,
  };
}

describe('drawing the hands', () => {
  it('draws five numbered fingertips on each hand in its colour, on the keyboard', () => {
    const { ctx, seen } = recordingContext();
    const view = viewOf([...scale, ...bass], 1.2);
    const drawn = drawFalling(ctx, view);
    expect(drawn.hands.map((h) => h.side)).toEqual(['right', 'left']);
    for (const digit of ['1', '2', '3', '4', '5'])
      expect(seen.texts.filter((t) => t.text === digit)).toHaveLength(2);
    expect(seen.strokes).toEqual(expect.arrayContaining([colours[0]?.edge, colours[1]?.edge]));
    expect(seen.fills).toEqual(expect.arrayContaining([colours[0]?.fill, colours[1]?.fill]));
  });

  it('keeps every part of the hands below the falling notes', () => {
    const { ctx, seen } = recordingContext();
    const view = viewOf([...scale, ...bass], 1.2);
    drawFalling(ctx, view);
    const keyTop = geometry(view).notesHeight;
    const digits = seen.texts.filter((t) => /^[1-5]$/.test(t.text));
    expect(digits.length).toBe(10);
    for (const t of digits) expect(t.y).toBeGreaterThan(keyTop);
    for (const a of seen.arcs) expect(a.y - 5).toBeGreaterThan(keyTop);
    const palms = seen.rounds.filter((r) => r.y + r.h > view.height);
    expect(palms).toHaveLength(2);
    for (const r of palms) expect(r.y).toBeGreaterThan(keyTop);
  });

  it('drops the pressing fingertip below the resting ones and reports where each is', () => {
    const { ctx, seen } = recordingContext();
    const view = viewOf(scale, 1.2);
    const drawn = drawFalling(ctx, view);
    const right = drawn.hands[0];
    expect(right?.pose.dip[2]).toBe(1);
    const unit = whiteUnits(RANGE)(64);
    expect(right?.x[2]).toBeCloseTo(unit * geometry(view).layout.whiteWidth, 5);
    expect(seen.arcs.length).toBe(5);
    const ys = seen.arcs.map((a) => a.y);
    expect(ys[2]).toBeGreaterThan(ys[1] ?? 0);
  });

  it('draws nothing extra when the hands are off', () => {
    const { ctx, seen } = recordingContext();
    const view = { ...viewOf(scale, 1.2) };
    delete view.hands;
    const drawn = drawFalling(ctx, view);
    expect(drawn.hands).toEqual([]);
    expect(seen.arcs).toHaveLength(0);
    expect(seen.texts.some((t) => t.text === '3')).toBe(false);
  });

  it('keeps the numbers off the fingertips when the keys are too narrow to read them', () => {
    const { ctx, seen } = recordingContext();
    drawFalling(ctx, viewOf(scale, 1.2, 300));
    expect(seen.texts.filter((t) => /^[1-5]$/.test(t.text))).toHaveLength(0);
    expect(seen.arcs.length).toBe(5);
  });
});
