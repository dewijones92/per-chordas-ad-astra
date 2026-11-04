import type { Annotations, AnnotationItem } from '@pcaa/shared';
import type { HistoryAction } from '../annotate/history.ts';
import type { KeyboardLayout } from './keyboard.ts';
import type { KeyRange } from './keys.ts';
import { barAt, type PerfBar, type Performance } from './performance.ts';

const SEPARATOR = '~';
const PITCH_DECIMALS = 1000;
const BAR_DECIMALS = 10_000;

export interface Axis {
  low: number;
  centres: readonly number[];
}

export interface Projection {
  axis: Axis;
  transpose: number;
  pxPerSecond: number;
}

export interface MarkOrigin {
  page: number;
  bar: PerfBar;
  id: string;
}

export interface ProjectedMarks {
  items: AnnotationItem[];
  origins: ReadonlyMap<string, MarkOrigin>;
}

export function buildAxis(layout: KeyboardLayout, range: KeyRange): Axis {
  const centres: number[] = [];
  for (let p = range.low; p <= range.high; p++) {
    const key = layout.byPitch.get(p);
    centres.push(key ? key.x + key.width / 2 : (centres.at(-1) ?? 0) + layout.whiteWidth / 2);
  }
  return { low: range.low, centres };
}

function slope(axis: Axis, at: 'low' | 'high'): number {
  const c = axis.centres;
  if (c.length < 2) return 12;
  const [a, b] = at === 'low' ? [c[0], c[1]] : [c.at(-2), c.at(-1)];
  return Math.max(1e-6, (b ?? 1) - (a ?? 0));
}

export function xOfPitch(axis: Axis, pitch: number): number {
  const c = axis.centres;
  const last = c.length - 1;
  const first = c[0] ?? 0;
  const end = c[last] ?? first;
  const index = pitch - axis.low;
  if (index <= 0) return first + index * slope(axis, 'low');
  if (index >= last) return end + (index - last) * slope(axis, 'high');
  const whole = Math.floor(index);
  const a = c[whole] ?? first;
  const b = c[whole + 1] ?? a;
  return a + (b - a) * (index - whole);
}

export function pitchOfX(axis: Axis, x: number): number {
  const c = axis.centres;
  const last = c.length - 1;
  const first = c[0] ?? 0;
  const end = c[last] ?? first;
  if (x <= first) return axis.low + (x - first) / slope(axis, 'low');
  if (x >= end) return axis.low + last + (x - end) / slope(axis, 'high');
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((c[mid] ?? 0) <= x) lo = mid;
    else hi = mid;
  }
  const a = c[lo] ?? first;
  const b = c[hi] ?? a;
  return axis.low + lo + (b === a ? 0 : (x - a) / (b - a));
}

const spanOf = (bar: PerfBar): number => Math.max(1e-6, bar.end - bar.start);

export const timeOfY = (proj: Projection, y: number): number => -y / proj.pxPerSecond;

function mapItem(
  item: AnnotationItem,
  fx: (x: number) => number,
  fy: (y: number) => number,
): AnnotationItem {
  switch (item.kind) {
    case 'stroke':
      return {
        ...item,
        points: item.points.map(([x, y, pressure]) => [fx(x), fy(y), pressure]),
      };
    case 'shape':
      return { ...item, x1: fx(item.x1), y1: fy(item.y1), x2: fx(item.x2), y2: fy(item.y2) };
    case 'text':
    case 'stamp':
      return { ...item, x: fx(item.x), y: fy(item.y) };
    case 'ink':
      return {
        ...item,
        paths: item.paths.map((path) => path.map(([x, y]) => [fx(x), fy(y)] as [number, number])),
      };
  }
}

export function toScreen(item: AnnotationItem, bar: PerfBar, proj: Projection): AnnotationItem {
  return mapItem(
    item,
    (pitch) => xOfPitch(proj.axis, pitch + proj.transpose),
    (fraction) => -(bar.start + fraction * spanOf(bar)) * proj.pxPerSecond,
  );
}

export function toStored(item: AnnotationItem, bar: PerfBar, proj: Projection): AnnotationItem {
  const round = (n: number, to: number) => Math.round(n * to) / to;
  return mapItem(
    item,
    (x) => round(pitchOfX(proj.axis, x) - proj.transpose, PITCH_DECIMALS),
    (y) => round((timeOfY(proj, y) - bar.start) / spanOf(bar), BAR_DECIMALS),
  );
}

export const groupOf = (shownId: string): string => shownId.split(SEPARATOR)[0] ?? shownId;

export function originOf(marks: ProjectedMarks, shownId: string): MarkOrigin | undefined {
  return marks.origins.get(shownId);
}

const passesCache = new WeakMap<Performance, Map<number, PerfBar[]>>();

function passesOf(perf: Performance): Map<number, PerfBar[]> {
  let passes = passesCache.get(perf);
  if (!passes) {
    passes = new Map();
    for (const bar of perf.bars) {
      const list = passes.get(bar.measure);
      if (list) list.push(bar);
      else passes.set(bar.measure, [bar]);
    }
    passesCache.set(perf, passes);
  }
  return passes;
}

export function projectMarks(
  doc: Annotations,
  perf: Performance,
  proj: Projection,
): ProjectedMarks {
  const items: AnnotationItem[] = [];
  const origins = new Map<string, MarkOrigin>();
  const passes = passesOf(perf);
  for (const [key, list] of Object.entries(doc.pages)) {
    const page = Number(key);
    for (const [pass, bar] of (passes.get(page - 1) ?? []).entries()) {
      for (const item of list) {
        const shown = { ...toScreen(item, bar, proj), id: `${item.id}${SEPARATOR}${String(pass)}` };
        items.push(shown);
        origins.set(shown.id, { page, bar, id: item.id });
      }
    }
  }
  return { items, origins };
}

function startOf(item: AnnotationItem): number {
  switch (item.kind) {
    case 'stroke':
      return item.points[0]?.[1] ?? 0;
    case 'shape':
      return item.y1;
    case 'text':
    case 'stamp':
      return item.y;
    case 'ink':
      return item.paths[0]?.[0]?.[1] ?? 0;
  }
}

export function toStoredActions(
  action: HistoryAction,
  marks: ProjectedMarks,
  perf: Performance,
  proj: Projection,
): HistoryAction[] {
  switch (action.type) {
    case 'add': {
      const bar = perf.bars[barAt(perf, timeOfY(proj, startOf(action.item)))];
      if (!bar) return [];
      return [{ ...action, page: bar.measure + 1, item: toStored(action.item, bar, proj) }];
    }
    case 'update': {
      const origin = originOf(marks, action.item.id);
      if (!origin) return [];
      return [
        {
          ...action,
          page: origin.page,
          item: { ...toStored(action.item, origin.bar, proj), id: origin.id },
        },
      ];
    }
    case 'remove': {
      const byPage = new Map<number, Set<string>>();
      for (const shown of action.ids) {
        const origin = originOf(marks, shown);
        if (!origin) continue;
        const ids = byPage.get(origin.page) ?? new Set<string>();
        ids.add(origin.id);
        byPage.set(origin.page, ids);
      }
      return [...byPage].map(([page, ids]) => ({
        ...action,
        page,
        ids: [...ids],
      }));
    }
    default:
      return [action];
  }
}
