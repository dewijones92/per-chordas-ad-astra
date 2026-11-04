import type { StaffColour } from './colours.ts';
import { keyboardLayout, keyForPitch, type KeyboardLayout } from './keyboard.ts';
import { noteName, pitchName, type KeyRange } from './keys.ts';
import type { PerfNote, Performance } from './performance.ts';

export const LABEL_PX = 12;
export const KEYBOARD_SHARE = 0.2;
export const MAX_KEYBOARD_HEIGHT = 130;
export const STRIKE_SECONDS = 0.2;

export function keyUpAt(n: PerfNote, tails: boolean): number {
  return tails ? Math.min(n.end, n.start + STRIKE_SECONDS) : n.end;
}

export interface FallingView {
  perf: Performance;
  position: number;
  transpose: number;
  range: KeyRange;
  hidden: ReadonlySet<number>;
  muted: ReadonlySet<number>;
  colours: readonly StaffColour[];
  laneOf: (n: PerfNote) => number;
  tails: boolean;
  loop: { start: number; end: number } | null;
  names: { flats: boolean } | null;
  lookAhead: number;
  width: number;
  height: number;
}

export function maxNoteLength(notes: readonly PerfNote[]): number {
  let longest = 0;
  for (const n of notes) longest = Math.max(longest, n.end - n.start);
  return longest;
}

export function visibleNotes(
  notes: readonly PerfNote[],
  from: number,
  to: number,
  longest: number,
): PerfNote[] {
  let lo = 0;
  let hi = notes.length;
  const earliest = from - longest;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((notes[mid]?.start ?? Infinity) < earliest) lo = mid + 1;
    else hi = mid;
  }
  const out: PerfNote[] = [];
  for (let i = lo; i < notes.length; i++) {
    const n = notes[i];
    if (!n || n.start > to) break;
    if (n.end > from) out.push(n);
  }
  return out;
}

export function soundingAt(
  notes: readonly PerfNote[],
  position: number,
  longest: number,
): PerfNote[] {
  return visibleNotes(notes, position, position, longest).filter(
    (n) => n.start <= position && n.end > position,
  );
}

export interface Geometry {
  notesHeight: number;
  keyboardHeight: number;
  pxPerSecond: number;
  layout: KeyboardLayout;
}

export function geometry(
  view: Pick<FallingView, 'width' | 'height' | 'range' | 'lookAhead'>,
): Geometry {
  const keyboardHeight = Math.min(MAX_KEYBOARD_HEIGHT, Math.max(48, view.height * KEYBOARD_SHARE));
  const notesHeight = Math.max(0, view.height - keyboardHeight);
  return {
    notesHeight,
    keyboardHeight,
    pxPerSecond: notesHeight / view.lookAhead,
    layout: keyboardLayout(view.range, view.width),
  };
}

const longestCache = new WeakMap<Performance, number>();

function longestOf(perf: Performance): number {
  let value = longestCache.get(perf);
  if (value === undefined) {
    value = maxNoteLength(perf.notes);
    longestCache.set(perf, value);
  }
  return value;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  centre: number,
  baseline: number,
  onBlock: boolean,
): void {
  ctx.font = `800 ${String(LABEL_PX)}px Nunito Variable, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  if (onBlock) {
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, centre, baseline);
    ctx.fillStyle = '#1d1533';
  }
  ctx.fillText(text, centre, baseline);
  ctx.textAlign = 'start';
}

export function drawFalling(
  ctx: CanvasRenderingContext2D,
  view: FallingView,
): ReadonlyMap<number, string> {
  const { width, height, perf, position, transpose, range } = view;
  const g = geometry(view);
  const { layout, notesHeight, pxPerSecond } = g;
  const longest = longestOf(perf);
  const top = position + notesHeight / Math.max(1, pxPerSecond);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, notesHeight);
  ctx.fillStyle = '#f6f3ff';
  for (const k of layout.keys) if (k.black) ctx.fillRect(k.x, 0, k.width, notesHeight);
  ctx.strokeStyle = '#ece5ff';
  ctx.lineWidth = 1;
  for (const k of layout.keys) {
    if (!k.black && (k.pitch % 12 === 0 || k.pitch % 12 === 5)) {
      ctx.beginPath();
      ctx.moveTo(Math.round(k.x) + 0.5, 0);
      ctx.lineTo(Math.round(k.x) + 0.5, notesHeight);
      ctx.stroke();
    }
  }

  const yOf = (t: number) => notesHeight - (t - position) * pxPerSecond;

  if (view.loop) {
    const y1 = Math.max(0, yOf(view.loop.end));
    const y2 = Math.min(notesHeight, yOf(view.loop.start));
    if (y2 > 0 && y1 < notesHeight) {
      ctx.fillStyle = 'rgba(255, 197, 61, 0.14)';
      ctx.fillRect(0, y1, width, y2 - y1);
    }
  }

  ctx.font = '700 11px Nunito Variable, system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  for (const bar of perf.bars) {
    if (bar.start < position - 0.001 || bar.start > top) continue;
    const y = Math.round(yOf(bar.start)) + 0.5;
    ctx.strokeStyle = '#d6cdf5';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = '#5c5470';
    ctx.fillText(String(bar.number), 4, y - 2);
  }

  const notes = visibleNotes(perf.notes, position, top, longest);
  const labelTops = new Map<number, number>();
  for (const n of notes) {
    if (view.hidden.has(view.laneOf(n))) continue;
    const key = keyForPitch(layout, n.pitch + transpose, range);
    if (!key) continue;
    const colour = view.colours[view.laneOf(n)];
    if (!colour) continue;
    const keyUp = keyUpAt(n, view.tails);
    const yTop = yOf(keyUp);
    const yBottom = yOf(n.start);
    const h = Math.max(4, yBottom - yTop - 1);
    const x = key.x + 1;
    const w = Math.max(3, key.width - 2);
    const sounding = n.start <= position && keyUp > position;
    const alpha = view.muted.has(view.laneOf(n)) ? 0.35 : 1;
    if (keyUp < n.end) {
      const tailTop = yOf(n.end);
      const tailWidth = Math.max(2, Math.min(4, w / 4));
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = colour.fill;
      ctx.fillRect(
        x + w / 2 - tailWidth / 2,
        tailTop,
        tailWidth,
        Math.max(0, yBottom - h - tailTop),
      );
    }
    ctx.globalAlpha = alpha;
    roundRect(ctx, x, yBottom - h, w, h, Math.min(6, w / 3));
    ctx.fillStyle = sounding ? colour.edge : colour.fill;
    ctx.fill();
    ctx.strokeStyle = '#1d1533';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const onBlock = h >= LABEL_PX + 4 && w >= LABEL_PX;
    const baseline = onBlock ? yBottom - 2 : yBottom - h - 1;
    if (view.names && baseline <= (labelTops.get(key.pitch) ?? Infinity) - 1) {
      drawLabel(
        ctx,
        pitchName(n.pitch + transpose, view.names.flats),
        x + w / 2,
        baseline,
        onBlock,
      );
      labelTops.set(key.pitch, baseline - LABEL_PX);
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#1d1533';
  ctx.fillRect(0, notesHeight - 2, width, 3);

  const pressed = new Map<number, string>();
  for (const n of soundingAt(perf.notes, position, longest)) {
    if (view.hidden.has(view.laneOf(n)) || keyUpAt(n, view.tails) <= position) continue;
    const colour = view.colours[view.laneOf(n)];
    if (colour) pressed.set(n.pitch + transpose, colour.fill);
  }

  const keyTop = notesHeight + 1;
  const keyHeight = g.keyboardHeight - 1;
  for (const k of layout.keys) {
    if (k.black) continue;
    ctx.fillStyle = pressed.get(k.pitch) ?? '#ffffff';
    ctx.fillRect(k.x, keyTop, k.width, keyHeight);
    ctx.strokeStyle = '#1d1533';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(k.x) + 0.5, keyTop + 0.5, Math.round(k.width), keyHeight - 1);
    if (k.pitch % 12 === 0 && k.width >= 14) {
      ctx.fillStyle = pressed.has(k.pitch) ? '#ffffff' : '#5c5470';
      ctx.font = `700 ${String(Math.min(11, Math.floor(k.width * 0.55)))}px Nunito Variable, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(noteName(k.pitch), k.x + k.width / 2, keyTop + keyHeight - 4);
      ctx.textAlign = 'start';
    }
  }
  for (const k of layout.keys) {
    if (!k.black) continue;
    ctx.fillStyle = pressed.get(k.pitch) ?? '#1d1533';
    roundRect(ctx, k.x, keyTop, k.width, keyHeight * 0.62, 3);
    ctx.fill();
    if (pressed.has(k.pitch)) {
      ctx.strokeStyle = '#1d1533';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  return pressed;
}
