import type { Annotations, AnnotationItem } from '@pcaa/shared';
import { describe, expect, it } from 'vitest';
import { itemsOn } from '../src/annotate/history.ts';
import { keyboardLayout } from '../src/music/keyboard.ts';
import {
  buildAxis,
  groupOf,
  originOf,
  pitchOfX,
  projectMarks,
  toScreen,
  toStored,
  toStoredActions,
  xOfPitch,
  type Projection,
} from '../src/music/falling-marks.ts';
import type { PerfBar, Performance } from '../src/music/performance.ts';

const bar = (measure: number, start: number, end: number): PerfBar => ({
  measure,
  number: measure + 1,
  start,
  end,
  beats: 3,
});

const perf = (bars: PerfBar[]): Performance => ({ bars }) as unknown as Performance;

function barOf(p: Performance, index: number): PerfBar {
  const found = p.bars[index];
  if (!found) throw new Error(`no bar ${String(index)}`);
  return found;
}

const plain = perf([bar(0, 0, 2), bar(1, 2, 4), bar(2, 4, 8)]);
const repeated = perf([bar(0, 0, 2), bar(1, 2, 4), bar(0, 4, 6), bar(1, 6, 8)]);

function projection(
  over: { low?: number; high?: number; width?: number; pps?: number; transpose?: number } = {},
): Projection {
  const range = { low: over.low ?? 48, high: over.high ?? 84 };
  return {
    axis: buildAxis(keyboardLayout(range, over.width ?? 720), range),
    transpose: over.transpose ?? 0,
    pxPerSecond: over.pps ?? 100,
  };
}

const stamp = (id: string, x: number, y: number): AnnotationItem => ({
  kind: 'stamp',
  id,
  colour: '#e0213f',
  glyph: '1',
  x,
  y,
  size: 21,
});

const yOf = (item: AnnotationItem | undefined): number =>
  item?.kind === 'stamp' ? item.y : Number.NaN;

describe('the keyboard axis', () => {
  it('puts a whole pitch on the middle of its key and reads it back', () => {
    const range = { low: 48, high: 84 };
    const layout = keyboardLayout(range, 720);
    const axis = buildAxis(layout, range);
    for (const p of [48, 49, 60, 64, 65, 71, 84]) {
      const key = layout.byPitch.get(p);
      if (!key) throw new Error('no key');
      expect(xOfPitch(axis, p)).toBeCloseTo(key.x + key.width / 2, 6);
      expect(pitchOfX(axis, xOfPitch(axis, p))).toBeCloseTo(p, 6);
    }
  });

  it('runs smoothly between keys and past both ends of the keyboard', () => {
    const axis = projection().axis;
    expect(xOfPitch(axis, 60.5)).toBeGreaterThan(xOfPitch(axis, 60));
    expect(xOfPitch(axis, 60.5)).toBeLessThan(xOfPitch(axis, 61));
    for (const p of [30, 47.25, 60.4, 84.7, 100]) {
      expect(pitchOfX(axis, xOfPitch(axis, p))).toBeCloseTo(p, 6);
    }
    expect(xOfPitch(axis, 40)).toBeLessThan(0);
  });

  it('follows the width and the range the keyboard is fitted to', () => {
    for (const [range, width] of [
      [{ low: 21, high: 108 }, 1200],
      [{ low: 55, high: 79 }, 500],
      [{ low: 60, high: 61 }, 300],
    ] as const) {
      const axis = buildAxis(keyboardLayout(range, width), range);
      for (const p of [range.low, range.low + 0.3, range.high]) {
        expect(pitchOfX(axis, xOfPitch(axis, p))).toBeCloseTo(p, 6);
      }
    }
  });
});

describe('a mark pinned to a bar', () => {
  const stored = stamp('a', 60.25, 0.5);

  it('lands halfway through its bar, on its pitch, at any speed of fall', () => {
    for (const pps of [40, 100, 350]) {
      const proj = projection({ pps });
      const on = toScreen(stored, barOf(plain, 1), proj);
      if (on.kind !== 'stamp') throw new Error('not a stamp');
      expect(on.y).toBeCloseTo(-3 * pps, 6);
      expect(on.x).toBeCloseTo(xOfPitch(proj.axis, 60.25), 6);
      expect(on.size).toBe(21);
    }
  });

  it('comes back to the same bar position from the screen', () => {
    const proj = projection({ pps: 130, transpose: 3, width: 905 });
    const there = toScreen(stored, barOf(plain, 2), proj);
    const back = toStored(there, barOf(plain, 2), proj);
    if (back.kind !== 'stamp') throw new Error('not a stamp');
    expect(back.x).toBeCloseTo(60.25, 2);
    expect(back.y).toBeCloseTo(0.5, 3);
  });

  it('moves up the keyboard with a transposition, staying on its written pitch', () => {
    const base = projection({ low: 40, high: 90 });
    const up = projection({ low: 40, high: 90, transpose: 2 });
    const a = toScreen(stored, barOf(plain, 0), base);
    const b = toScreen(stored, barOf(plain, 0), up);
    if (a.kind !== 'stamp' || b.kind !== 'stamp') throw new Error('not a stamp');
    expect(b.x).toBeCloseTo(xOfPitch(up.axis, 62.25), 6);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBe(a.y);
  });

  it('keeps a stroke running into the next bar tied to the bar it started in', () => {
    const proj = projection();
    const stroke: AnnotationItem = {
      kind: 'stroke',
      id: 's',
      tool: 'pen',
      colour: '#000000',
      size: 3,
      points: [
        [60, 0.9, 0.5],
        [61, 1.2, 0.5],
      ],
    };
    const on = toScreen(stroke, barOf(plain, 0), proj);
    if (on.kind !== 'stroke') throw new Error('not a stroke');
    expect(on.points[0]?.[1]).toBeCloseTo(-1.8 * 100, 6);
    expect(on.points[1]?.[1]).toBeCloseTo(-2.4 * 100, 6);
    expect(on.points[1]?.[2]).toBe(0.5);
  });

  it('maps every corner of a shape', () => {
    const proj = projection();
    const shape: AnnotationItem = {
      kind: 'shape',
      id: 'e',
      shape: 'ellipse',
      colour: '#000000',
      size: 2.5,
      x1: 59,
      y1: 0.25,
      x2: 62,
      y2: 0.75,
    };
    const on = toScreen(shape, barOf(plain, 2), proj);
    if (on.kind !== 'shape') throw new Error('not a shape');
    expect(on.y1).toBeCloseTo(-(4 + 4 * 0.25) * 100, 6);
    expect(on.y2).toBeCloseTo(-(4 + 4 * 0.75) * 100, 6);
    expect(on.x2 - on.x1).toBeGreaterThan(0);
  });
});

describe('showing the marks of a document', () => {
  const doc = (pages: Annotations['pages']): Annotations => ({ version: 1, pages });

  it('shows a mark once in a bar that plays once', () => {
    const marks = projectMarks(doc({ '2': [stamp('a', 60, 0.5)] }), plain, projection());
    expect(marks.items).toHaveLength(1);
    expect(yOf(marks.items[0])).toBeCloseTo(-300, 6);
  });

  it('shows a mark on every pass of a repeated bar, like the notes', () => {
    const marks = projectMarks(doc({ '1': [stamp('a', 60, 0.5)] }), repeated, projection());
    expect(marks.items.map(yOf)).toEqual([-100, -500]);
    expect(new Set(marks.items.map((i) => i.id)).size).toBe(2);
    expect(marks.items.map((i) => groupOf(i.id))).toEqual(['a', 'a']);
  });

  it('shows nothing for a bar the music never plays', () => {
    const marks = projectMarks(doc({ '9': [stamp('a', 60, 0.5)] }), plain, projection());
    expect(marks.items).toEqual([]);
  });

  it('works out each pass from its own length when a repeat plays at another speed', () => {
    const uneven = perf([bar(0, 0, 2), bar(0, 2, 6)]);
    const marks = projectMarks(doc({ '1': [stamp('a', 60, 0.5)] }), uneven, projection());
    expect(marks.items.map(yOf)).toEqual([-100, -400]);
  });

  it('says where each shown mark came from', () => {
    const marks = projectMarks(doc({ '1': [stamp('a', 60, 0.5)] }), repeated, projection());
    const second = marks.items[1];
    if (!second) throw new Error('no second pass');
    expect(originOf(marks, second.id)).toMatchObject({ page: 1, id: 'a' });
    expect(originOf(marks, second.id)?.bar).toBe(repeated.bars[2]);
  });
});

describe('drawing on the falling notes', () => {
  const proj = projection({ pps: 100 });
  const none = projectMarks({ version: 1, pages: {} }, repeated, proj);

  it('files a new mark under the bar that passes where it started, with its place in that bar', () => {
    const drawn = stamp('n', xOfPitch(proj.axis, 64), -500);
    const [action] = toStoredActions({ type: 'add', page: 0, item: drawn }, none, repeated, proj);
    if (action?.type !== 'add') throw new Error('not an add');
    expect(action.page).toBe(1);
    const item = action.item;
    expect(item.kind === 'stamp' && item.y).toBeCloseTo(0.5, 3);
    expect(item.kind === 'stamp' && item.x).toBeCloseTo(64, 2);
  });

  it('files a mark drawn before the music, or after it, on the first and last bars', () => {
    const early = stamp('e', 100, 50);
    const late = stamp('l', 100, -900);
    const [a] = toStoredActions({ type: 'add', page: 0, item: early }, none, plain, proj);
    const [b] = toStoredActions({ type: 'add', page: 0, item: late }, none, plain, proj);
    expect(a?.type === 'add' && a.page).toBe(1);
    expect(a?.type === 'add' && a.item.kind === 'stamp' && a.item.y).toBeCloseTo(-0.25, 3);
    expect(b?.type === 'add' && b.page).toBe(3);
  });

  it('updates a mark seen on a later pass against the pass it was seen on, keeping its id and bar', () => {
    const shown = projectMarks(
      { version: 1, pages: { '1': [stamp('a', 60, 0.5)] } },
      repeated,
      proj,
    );
    const second = shown.items[1];
    if (second?.kind !== 'stamp') throw new Error('no second pass');
    const moved = { ...second, y: second.y - 100 };
    const [action] = toStoredActions(
      { type: 'update', page: 0, item: moved, group: 'g' },
      shown,
      repeated,
      proj,
    );
    if (action?.type !== 'update') throw new Error('not an update');
    expect(action).toMatchObject({ page: 1, group: 'g' });
    expect(action.item.id).toBe('a');
    expect(action.item.kind === 'stamp' && action.item.y).toBeCloseTo(1, 3);
  });

  it('erases a mark everywhere it shows, by its own id, on its own bar', () => {
    const shown = projectMarks(
      { version: 1, pages: { '2': [stamp('a', 60, 0.5), stamp('b', 61, 0.5)] } },
      repeated,
      proj,
    );
    const ids = shown.items.filter((i) => groupOf(i.id) === 'a').map((i) => i.id);
    const actions = toStoredActions(
      { type: 'remove', page: 0, ids, group: 'e' },
      shown,
      repeated,
      proj,
    );
    expect(actions).toEqual([{ type: 'remove', page: 2, ids: ['a'], group: 'e' }]);
  });

  it('leaves undo, redo and the end of a gesture alone', () => {
    for (const type of ['undo', 'redo', 'end-group'] as const)
      expect(toStoredActions({ type }, none, repeated, proj)).toEqual([{ type }]);
  });

  it('survives a change of look-ahead, speed and key between drawing and showing', () => {
    const drawnWith = projection({ pps: 90, transpose: 0, width: 800 });
    const showWith = projection({ pps: 210, transpose: 5, width: 1100, low: 40, high: 100 });
    const item = stamp('n', xOfPitch(drawnWith.axis, 66), -(2 + 2 * 0.3) * 90);
    const [action] = toStoredActions(
      { type: 'add', page: 0, item },
      projectMarks({ version: 1, pages: {} }, plain, drawnWith),
      plain,
      drawnWith,
    );
    if (action?.type !== 'add') throw new Error('not an add');
    const doc: Annotations = { version: 1, pages: { [String(action.page)]: [action.item] } };
    const [shown] = projectMarks(doc, plain, showWith).items;
    expect(shown?.kind === 'stamp' && shown.y).toBeCloseTo(-(2 + 2 * 0.3) * 210, 1);
    expect(shown?.kind === 'stamp' && shown.x).toBeCloseTo(xOfPitch(showWith.axis, 66 + 5), 1);
    expect(itemsOn(doc, action.page)).toHaveLength(1);
  });
});
