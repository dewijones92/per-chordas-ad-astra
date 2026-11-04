import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK_AHEAD, MAX_LOOK_AHEAD, MIN_LOOK_AHEAD, stepLookAhead } from '@pcaa/shared';
import { wheelLookAhead } from '../src/score/zoom.ts';
import {
  drawFalling,
  CHORD_PX,
  FINGER_COLOUR,
  FINGER_PX,
  SUGGESTED_COLOUR,
  geometry,
  LABEL_PX,
  noteAt,
  type FallingView,
} from '../src/music/falling.ts';
import type { PerfNote, Performance } from '../src/music/performance.ts';

interface Text {
  text: string;
  x: number;
  y: number;
  font: string;
  fill?: string;
}

function recordingContext(): { ctx: CanvasRenderingContext2D; texts: Text[] } {
  const texts: Text[] = [];
  const state: Record<string, unknown> = { font: '' };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'fillText')
        return (text: string, x: number, y: number) => {
          texts.push({
            text,
            x,
            y,
            font: String(target['font']),
            fill: String(target['fillStyle']),
          });
        };
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 7 });
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value: unknown) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
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

function perfOf(notes: PerfNote[]): Performance {
  return {
    title: 't',
    notes,
    bars: [],
    clicks: [],
    staves: [],
    duration: 30,
    lowest: 48,
    highest: 84,
    keyFifths: 0,
    keyMinor: false,
    baseBpm: null,
    warnings: [],
  };
}

function view(perf: Performance, lookAhead: number): FallingView {
  return {
    perf,
    position: 0,
    transpose: 0,
    range: { low: 48, high: 84 },
    hidden: new Set(),
    muted: new Set(),
    colours: [{ fill: '#6d3df2', edge: '#4b22c9', glow: '#ece5ff' }],
    laneOf: () => 0,
    tails: false,
    loop: null,
    names: { flats: false },
    lookAhead,
    width: 1000,
    height: 600,
  };
}

const fontPx = (font: string) => Number(/(\d+)px/.exec(font)?.[1] ?? 0);

describe('look ahead', () => {
  it('shows more seconds in the same height when zoomed out', () => {
    const base = { width: 800, height: 600, range: { low: 48, high: 83 } };
    expect(geometry({ ...base, lookAhead: DEFAULT_LOOK_AHEAD }).pxPerSecond).toBe(160);
    expect(geometry({ ...base, lookAhead: 12 }).pxPerSecond).toBe(40);
  });

  it('steps along a ladder and stops at the ends', () => {
    expect(stepLookAhead(3, 1)).toBe(4);
    expect(stepLookAhead(3, -1)).toBe(2);
    expect(stepLookAhead(MAX_LOOK_AHEAD, 1)).toBe(MAX_LOOK_AHEAD);
    expect(stepLookAhead(MIN_LOOK_AHEAD, -1)).toBe(MIN_LOOK_AHEAD);
    expect(stepLookAhead(3.4, 1)).toBe(4);
    expect(stepLookAhead(3.4, -1)).toBe(3);
  });

  it('zooms out on a wheel down and in on a wheel up, within the limits', () => {
    expect(wheelLookAhead(3, 100, 0)).toBeGreaterThan(3);
    expect(wheelLookAhead(3, -100, 0)).toBeLessThan(3);
    expect(wheelLookAhead(MAX_LOOK_AHEAD, 100, 0)).toBe(MAX_LOOK_AHEAD);
    expect(wheelLookAhead(MIN_LOOK_AHEAD, -100, 0)).toBe(MIN_LOOK_AHEAD);
  });
});

describe('labels when zoomed out', () => {
  const run = Array.from({ length: 40 }, (_, i) => note(60, i * 0.25, i * 0.25 + 0.2));
  const chord = [note(64, 0, 0.2), note(67, 0, 0.2)];

  it('keeps note names a readable size however thin the notes get', () => {
    const { ctx, texts } = recordingContext();
    drawFalling(ctx, view(perfOf([...run, ...chord]), MAX_LOOK_AHEAD));
    const names = texts.filter((t) => /^[A-G][♯♭]?$/.test(t.text));
    expect(names.length).toBeGreaterThan(3);
    for (const t of names) expect(fontPx(t.font)).toBeGreaterThanOrEqual(LABEL_PX);
    expect(names.map((t) => t.text)).toEqual(expect.arrayContaining(['C', 'E', 'G']));
  });

  it('never stacks two labels on top of each other in one key', () => {
    const { ctx, texts } = recordingContext();
    drawFalling(ctx, view(perfOf(run), MAX_LOOK_AHEAD));
    const ys = texts
      .filter((t) => t.text === 'C')
      .map((t) => t.y)
      .sort((a, b) => b - a);
    for (let i = 1; i < ys.length; i++)
      expect((ys[i - 1] ?? 0) - (ys[i] ?? 0)).toBeGreaterThanOrEqual(LABEL_PX);
  });

  it('labels every note when there is room', () => {
    const { ctx, texts } = recordingContext();
    drawFalling(ctx, view(perfOf(run.slice(0, 8)), MIN_LOOK_AHEAD * 2));
    expect(texts.filter((t) => t.text === 'C')).toHaveLength(8);
  });
});

describe('finger numbers on the falling notes', () => {
  const withFinger = (
    pitch: number,
    start: number,
    text: string,
    kind: 'piano' | 'guitarRight',
  ) => ({
    ...note(pitch, start, start + 0.4),
    source: {
      staff: 0,
      measure: 0,
      pitch,
      tick: 0,
      ticks: 480,
      tieForward: false,
      grace: false,
      finger: { text, kind },
    },
  });

  it('draws piano fingering as a red number, the same size zoomed in or out, and leaves guitar fingering off', () => {
    for (const lookAhead of [MIN_LOOK_AHEAD * 2, MAX_LOOK_AHEAD]) {
      const { ctx, texts } = recordingContext();
      const drawn = drawFalling(
        ctx,
        view(
          perfOf([withFinger(60, 0, '3', 'piano'), withFinger(64, 0.5, 'p', 'guitarRight')]),
          lookAhead,
        ),
      );
      expect(drawn.fingers).toBe(1);
      const finger = texts.find((t) => t.text === '3');
      expect(finger).toBeDefined();
      expect(fontPx(finger?.font ?? '')).toBe(FINGER_PX);
      expect(texts.some((t) => t.text === 'p')).toBe(false);
      expect(texts.filter((t) => t.text === 'C')).toHaveLength(1);
    }
  });
});

describe('picking a falling note and fingering it', () => {
  const fingered = {
    ...note(60, 0, 0.5),
    source: {
      staff: 0,
      measure: 0,
      pitch: 60,
      tick: 0,
      ticks: 480,
      tieForward: false,
      grace: false,
      finger: { text: '3', kind: 'piano' as const },
    },
  };
  const plain = {
    ...note(67, 1, 1.5),
    source: {
      staff: 0,
      measure: 0,
      pitch: 67,
      tick: 960,
      ticks: 480,
      tieForward: false,
      grace: false,
    },
  };

  it('finds the note under the pointer, and nothing in empty space', () => {
    const v = view(perfOf([fingered, plain]), DEFAULT_LOOK_AHEAD);
    const g = geometry(v);
    const key = g.layout.keys.find((k) => k.pitch === 60);
    if (!key) throw new Error('no C4');
    const y = g.notesHeight - 0.25 * g.pxPerSecond;
    expect(noteAt(v, key.x + key.width / 2, y)?.pitch).toBe(60);
    expect(noteAt(v, key.x + key.width / 2, 5)).toBeNull();
  });

  it('draws your finger in place of the file’s, and outlines the chosen note', () => {
    const { ctx, texts } = recordingContext();
    const drawn = drawFalling(ctx, {
      ...view(perfOf([fingered, plain]), DEFAULT_LOOK_AHEAD),
      userFingers: new Map([
        ['s0m0t0p60', '1'],
        ['s0m0t960p67', '5'],
      ]),
      selected: 's0m0t960p67',
    });
    expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(['1', '5']));
    expect(texts.some((t) => t.text === '3')).toBe(false);
    expect(drawn.fingers).toBe(2);
    expect(drawn.selected).toBe(1);
  });
});

describe('suggested fingering on the falling notes', () => {
  it('draws a suggestion in grey, and a red finger wins on the same note', () => {
    const a = {
      ...note(60, 0, 0.5),
      source: {
        staff: 0,
        measure: 0,
        pitch: 60,
        tick: 0,
        ticks: 480,
        tieForward: false,
        grace: false,
      },
    };
    const b = {
      ...note(64, 1, 1.5),
      source: {
        staff: 0,
        measure: 0,
        pitch: 64,
        tick: 960,
        ticks: 480,
        tieForward: false,
        grace: false,
      },
    };
    const { ctx, texts } = recordingContext();
    const drawn = drawFalling(ctx, {
      ...view(perfOf([a, b]), DEFAULT_LOOK_AHEAD),
      userFingers: new Map([['s0m0t960p64', '4']]),
      suggested: new Map([
        [a, 1],
        [b, 3],
      ]),
    });
    const one = texts.find((t) => t.text === '1');
    const four = texts.find((t) => t.text === '4');
    expect(one?.fill).toBe(SUGGESTED_COLOUR);
    expect(four?.fill).toBe(FINGER_COLOUR);
    expect(texts.some((t) => t.text === '3')).toBe(false);
    expect(drawn.suggested).toBe(1);
    expect(drawn.fingers).toBe(1);
  });
});

describe('chord names on the falling notes', () => {
  const chords = [
    { start: 1, name: 'G' },
    { start: 1.05, name: 'Am' },
    { start: 2, name: 'C' },
  ];

  it('draws each chord name at a fixed size at the time it starts, none on top of another', () => {
    const { ctx, texts } = recordingContext();
    const drawn = drawFalling(ctx, { ...view(perfOf([]), DEFAULT_LOOK_AHEAD), chords });
    expect(drawn.chords).toEqual(['G', 'C']);
    const g = texts.find((t) => t.text === 'G');
    const c = texts.find((t) => t.text === 'C');
    expect(fontPx(g?.font ?? '')).toBe(CHORD_PX);
    expect((g?.y ?? 0) - (c?.y ?? 0)).toBeGreaterThan(CHORD_PX);
    expect(texts.some((t) => t.text === 'Am')).toBe(false);
  });

  it('keeps the same size however far you zoom out', () => {
    const { ctx, texts } = recordingContext();
    drawFalling(ctx, { ...view(perfOf([]), MAX_LOOK_AHEAD), chords: [{ start: 4, name: 'F/A' }] });
    expect(fontPx(texts.find((t) => t.text === 'F/A')?.font ?? '')).toBe(CHORD_PX);
  });

  it('lets a chord go once it has reached the keys, and draws none when there are none', () => {
    const later = recordingContext();
    const drawn = drawFalling(later.ctx, {
      ...view(perfOf([]), DEFAULT_LOOK_AHEAD),
      position: 1.5,
      chords,
    });
    expect(drawn.chords).toEqual(['C']);
    const none = recordingContext();
    expect(drawFalling(none.ctx, view(perfOf([]), DEFAULT_LOOK_AHEAD)).chords).toEqual([]);
  });
});
