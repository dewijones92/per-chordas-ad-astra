import { describe, expect, it } from 'vitest';
import {
  drawFalling,
  EXPECTED_COLOUR,
  EXPECTED_FILL,
  geometry,
  keyAt,
  keyTargets,
  PLAYED_COLOUR,
  type FallingView,
} from '../src/music/falling.ts';
import { BLACK_KEY_HEIGHT_RATIO, keyAtPoint, keyboardLayout } from '../src/music/keyboard.ts';
import type { Performance } from '../src/music/performance.ts';

const range = { low: 60, high: 71 };
const layout = keyboardLayout(range, 700);
const top = 100;
const height = 80;

describe('which piano key is under a point', () => {
  it('finds a white key by its place along the keyboard', () => {
    expect(keyAtPoint(layout, 5, top + 70, top, height)).toBe(60);
    expect(keyAtPoint(layout, 105, top + 70, top, height)).toBe(62);
    expect(keyAtPoint(layout, 695, top + 70, top, height)).toBe(71);
  });

  it('finds a black key only in the top part of the keyboard, and the white key under it below', () => {
    const black = layout.byPitch.get(61);
    if (!black) throw new Error('no C sharp');
    const x = black.x + black.width / 2;
    expect(keyAtPoint(layout, x, top + 10, top, height)).toBe(61);
    const below = top + height * BLACK_KEY_HEIGHT_RATIO + 4;
    expect(keyAtPoint(layout, black.x + 1, below, top, height)).toBe(60);
    expect(keyAtPoint(layout, black.x + black.width - 1, below, top, height)).toBe(62);
  });

  it('gives a point to the black key where it overlaps its white neighbour', () => {
    const black = layout.byPitch.get(63);
    if (!black) throw new Error('no D sharp');
    expect(keyAtPoint(layout, black.x + 1, top + 5, top, height)).toBe(63);
    expect(keyAtPoint(layout, black.x - 1, top + 5, top, height)).toBe(62);
  });

  it('finds nothing above or below the keyboard, or past its ends', () => {
    expect(keyAtPoint(layout, 50, top - 1, top, height)).toBeNull();
    expect(keyAtPoint(layout, 50, top + height + 1, top, height)).toBeNull();
    expect(keyAtPoint(layout, 701, top + 70, top, height)).toBeNull();
    expect(keyAtPoint(layout, -1, top + 70, top, height)).toBeNull();
  });
});

const perf: Performance = {
  title: 't',
  notes: [],
  bars: [],
  clicks: [],
  staves: [],
  duration: 4,
  lowest: 60,
  highest: 71,
  keyFifths: 0,
  keyMinor: false,
  baseBpm: null,
  warnings: [],
};

const view = (extra: Partial<FallingView> = {}): FallingView => ({
  perf,
  position: 0,
  transpose: 0,
  range,
  hidden: new Set(),
  muted: new Set(),
  colours: [],
  laneOf: () => 0,
  tails: false,
  loop: null,
  names: null,
  lookAhead: 4,
  width: 700,
  height: 400,
  ...extra,
});

function paint(v: FallingView): { fills: Map<string, string[]> } {
  const fills = new Map<string, string[]>();
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'fillRect')
        return (x: number, y: number) => {
          const key = `${String(Math.round(x))},${String(Math.round(y))}`;
          fills.set(key, [...(fills.get(key) ?? []), String(target['fillStyle'])]);
        };
      if (prop === 'measureText') return () => ({ width: 5 });
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value: unknown) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  drawFalling(ctx, v);
  return { fills };
}

describe('the on-screen keyboard', () => {
  const g = geometry(view());
  const keyTop = Math.round(g.notesHeight + 1);
  const whiteAt = (pitch: number) =>
    `${String(Math.round(g.layout.byPitch.get(pitch)?.x ?? NaN))},${String(keyTop)}`;

  it('reads a click on a key in the same place the canvas draws it', () => {
    const v = view();
    const key = g.layout.byPitch.get(64);
    if (!key) throw new Error('no E');
    expect(keyAt(v, key.x + key.width / 2, g.notesHeight + g.keyboardHeight - 5)).toBe(64);
    expect(keyAt(v, key.x + key.width / 2, g.notesHeight - 20)).toBeNull();
  });

  it('lists where to click every key, at its centre', () => {
    const rows = keyTargets(view()).split(' ');
    expect(rows).toHaveLength(range.high - range.low + 1);
    const [pitch, x, y] = (rows.find((r) => r.startsWith('64:')) ?? '').split(':').map(Number);
    expect(pitch).toBe(64);
    expect(keyAt(view(), x ?? -1, y ?? -1)).toBe(64);
    const [, bx, by] = (rows.find((r) => r.startsWith('61:')) ?? '').split(':').map(Number);
    expect(keyAt(view(), bx ?? -1, by ?? -1)).toBe(61);
  });

  it('paints the keys to press, the keys you are pressing, and both, in different colours', () => {
    const plain = paint(view()).fills.get(whiteAt(60)) ?? [];
    const expected = paint(view({ expected: new Set([60]) })).fills.get(whiteAt(60)) ?? [];
    const played = paint(view({ played: new Set([60]) })).fills.get(whiteAt(60)) ?? [];
    const both =
      paint(view({ expected: new Set([60]), played: new Set([60]) })).fills.get(whiteAt(60)) ?? [];
    expect(plain.at(-1)).toBe('#ffffff');
    expect(expected.at(-1)).toBe(EXPECTED_FILL);
    expect(played.at(-1)).toBe(PLAYED_COLOUR);
    expect(both.at(-1)).toBe(PLAYED_COLOUR);
    expect(new Set([plain.at(-1), expected.at(-1), played.at(-1)]).size).toBe(3);
    expect(EXPECTED_COLOUR).not.toBe(PLAYED_COLOUR);
  });
});
