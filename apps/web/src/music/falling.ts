import type { StaffColour } from './colours.ts';
import { keyboardLayout, keyForPitch, type KeyboardLayout } from './keyboard.ts';
import { noteName, pitchName, type KeyRange } from './keys.ts';
import type { PerfNote, Performance } from './performance.ts';
import { noteKey } from './model.ts';
import type { ChordLabel } from './chords.ts';

export const LABEL_PX = 12;
export const FINGER_PX = 14;
export const CHORD_PX = 16;
export const CHORD_X = 34;
export const CHORD_COLOUR = '#a87300';
const MAX_REPORTED_BLOCKS = 64;
export const FINGER_COLOUR = '#d7263d';
export const SUGGESTED_COLOUR = '#6f6880';
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
  userFingers?: ReadonlyMap<string, string>;
  suggested?: ReadonlyMap<PerfNote, number>;
  chords?: readonly ChordLabel[];
  selected?: string | null;
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

function drawFinger(
  ctx: CanvasRenderingContext2D,
  text: string,
  centre: number,
  baseline: number,
  colour: string,
): void {
  ctx.font = `900 ${String(FINGER_PX)}px Nunito Variable, system-ui, sans-serif`;
  const width = Math.max(FINGER_PX, ctx.measureText(text).width + 6);
  roundRect(ctx, centre - width / 2, baseline - FINGER_PX - 1, width, FINGER_PX + 2, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = colour;
  ctx.fillText(text, centre, baseline);
  ctx.textAlign = 'start';
}

function drawChord(ctx: CanvasRenderingContext2D, text: string, baseline: number): number {
  ctx.font = `900 ${String(CHORD_PX)}px Nunito Variable, system-ui, sans-serif`;
  const height = CHORD_PX + 6;
  const width = Math.max(height, ctx.measureText(text).width + 12);
  roundRect(ctx, CHORD_X, baseline - height, width, height, 8);
  ctx.fillStyle = '#fff3cf';
  ctx.fill();
  ctx.strokeStyle = CHORD_COLOUR;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1d1533';
  ctx.fillText(text, CHORD_X + width / 2, baseline - height / 2);
  ctx.textAlign = 'start';
  return baseline - height;
}

export interface FallingDrawn {
  pressed: ReadonlyMap<number, string>;
  fingers: number;
  suggested: number;
  selected: number;
  chords: readonly string[];
  blocks: readonly { pitch: number; x: number; y: number }[];
}

export function fingerOf(
  n: PerfNote,
  user?: ReadonlyMap<string, string>,
  suggested?: ReadonlyMap<PerfNote, number>,
): { text: string; suggested: boolean } | null {
  const source = n.source;
  const given =
    (source ? user?.get(noteKey(source)) : undefined) ??
    (source?.finger?.kind === 'piano' ? source.finger.text : undefined);
  if (given !== undefined) return { text: given, suggested: false };
  const guess = suggested?.get(n);
  return guess === undefined ? null : { text: String(guess), suggested: true };
}

interface Block {
  key: NonNullable<ReturnType<typeof keyForPitch>>;
  keyUp: number;
  yBottom: number;
  h: number;
  x: number;
  w: number;
}

function blockOf(view: FallingView, g: Geometry, n: PerfNote): Block | null {
  const key = keyForPitch(g.layout, n.pitch + view.transpose, view.range);
  if (!key) return null;
  const yOf = (t: number) => g.notesHeight - (t - view.position) * g.pxPerSecond;
  const keyUp = keyUpAt(n, view.tails);
  const yBottom = yOf(n.start);
  return {
    key,
    keyUp,
    yBottom,
    h: Math.max(4, yBottom - yOf(keyUp) - 1),
    x: key.x + 1,
    w: Math.max(3, key.width - 2),
  };
}

export function noteAt(view: FallingView, px: number, py: number): PerfNote | null {
  const g = geometry(view);
  const top = view.position + g.notesHeight / Math.max(1, g.pxPerSecond);
  let hit: PerfNote | null = null;
  for (const n of visibleNotes(view.perf.notes, view.position, top, longestOf(view.perf))) {
    if (view.hidden.has(view.laneOf(n))) continue;
    const b = blockOf(view, g, n);
    if (
      b &&
      px >= b.x - 2 &&
      px <= b.x + b.w + 2 &&
      py >= b.yBottom - b.h - 2 &&
      py <= b.yBottom + 2
    )
      hit = n;
  }
  return hit;
}

export function drawFalling(ctx: CanvasRenderingContext2D, view: FallingView): FallingDrawn {
  const { width, height, perf, position, transpose } = view;
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
  let fingers = 0;
  let selectedDrawn = 0;
  let suggestedDrawn = 0;
  const blocks: { pitch: number; x: number; y: number }[] = [];
  for (const n of notes) {
    if (view.hidden.has(view.laneOf(n))) continue;
    const block = blockOf(view, g, n);
    if (!block) continue;
    const colour = view.colours[view.laneOf(n)];
    if (!colour) continue;
    const { key, keyUp, yBottom, h, x, w } = block;
    if (blocks.length < MAX_REPORTED_BLOCKS)
      blocks.push({
        pitch: n.pitch,
        x: Math.round(x + w / 2),
        y: Math.round(yBottom - Math.min(h, 40) / 2),
      });
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
    const chosen =
      view.selected != null && n.source !== undefined && noteKey(n.source) === view.selected;
    ctx.strokeStyle = chosen ? FINGER_COLOUR : '#1d1533';
    ctx.lineWidth = chosen ? 4 : 1.5;
    ctx.stroke();
    if (chosen) selectedDrawn += 1;
    const finger = fingerOf(n, view.userFingers, view.suggested);
    const stack = (finger ? FINGER_PX + 2 : 0) + (view.names ? LABEL_PX : 0);
    const onBlock = h >= stack + 4 && w >= LABEL_PX;
    let baseline = onBlock ? yBottom - 2 : yBottom - h - 1;
    if (stack > 0 && baseline <= (labelTops.get(key.pitch) ?? Infinity) - 1) {
      if (finger) {
        drawFinger(
          ctx,
          finger.text,
          x + w / 2,
          baseline,
          finger.suggested ? SUGGESTED_COLOUR : FINGER_COLOUR,
        );
        if (finger.suggested) suggestedDrawn += 1;
        else fingers += 1;
        baseline -= FINGER_PX + 2;
      }
      if (view.names) {
        drawLabel(
          ctx,
          pitchName(n.pitch + transpose, view.names.flats),
          x + w / 2,
          baseline,
          onBlock,
        );
        baseline -= LABEL_PX;
      }
      labelTops.set(key.pitch, baseline);
    }
    ctx.globalAlpha = 1;
  }

  const chordsDrawn: string[] = [];
  let chordTop = Infinity;
  for (const chord of view.chords ?? []) {
    if (chord.start < position - 0.001) continue;
    if (chord.start > top + (CHORD_PX + 6) / Math.max(1, pxPerSecond)) break;
    const baseline = yOf(chord.start) - 2;
    if (baseline > chordTop - 2) continue;
    chordTop = drawChord(ctx, chord.name, baseline);
    chordsDrawn.push(chord.name);
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
  return {
    pressed,
    fingers,
    suggested: suggestedDrawn,
    selected: selectedDrawn,
    chords: chordsDrawn,
    blocks,
  };
}
