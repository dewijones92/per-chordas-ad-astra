import type { StaffColour } from './colours.ts';
import {
  BLACK_KEY_HEIGHT_RATIO,
  keyAtPoint,
  keyboardLayout,
  keyForPitch,
  type KeyboardLayout,
} from './keyboard.ts';
import { noteName, pitchName, type KeyRange } from './keys.ts';
import { barAt, type PerfNote, type Performance } from './performance.ts';
import { noteKey } from './model.ts';
import type { ChordLabel } from './chords.ts';
import { drawHands } from './hand-draw.ts';
import type { HandLayer } from './hand-pose.ts';

export const BAR_EDGE = 26;
export const TOGETHER = 0.02;
export const JOIN_COLOUR = 'rgba(29, 21, 51, 0.75)';
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
export const EXPECTED_COLOUR = '#ff5d73';
export const EXPECTED_FILL = '#ffe6ea';
export const PLAYED_COLOUR = '#ffc53d';

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
  hands?: readonly HandLayer[];
  selected?: string | null;
  expected?: ReadonlySet<number>;
  played?: ReadonlySet<number>;
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

export type GeometryView = Pick<FallingView, 'width' | 'height' | 'range' | 'lookAhead'>;

export interface Geometry {
  notesHeight: number;
  keyboardHeight: number;
  pxPerSecond: number;
  layout: KeyboardLayout;
}

export function geometry(view: GeometryView): Geometry {
  const keyboardHeight = Math.min(MAX_KEYBOARD_HEIGHT, Math.max(48, view.height * KEYBOARD_SHARE));
  const notesHeight = Math.max(0, view.height - keyboardHeight);
  return {
    notesHeight,
    keyboardHeight,
    pxPerSecond: notesHeight / view.lookAhead,
    layout: keyboardLayout(view.range, Math.max(1, view.width - BAR_EDGE), BAR_EDGE),
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
  hands: readonly HandLayer[];
  blocks: readonly { pitch: number; x: number; y: number }[];
  bars: readonly { index: number; y: number }[];
  joins: number;
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

interface Onset {
  start: number;
  lane: number;
  left: number;
  right: number;
  y: number;
}

function joinsOf(group: readonly Onset[]): { from: number; to: number; y: number }[] {
  const lanes = new Map<number, { left: number; right: number; y: number }>();
  for (const o of group) {
    const span = lanes.get(o.lane);
    lanes.set(
      o.lane,
      span
        ? { left: Math.min(span.left, o.left), right: Math.max(span.right, o.right), y: span.y }
        : { left: o.left, right: o.right, y: o.y },
    );
  }
  const spans = [...lanes.values()].sort((a, b) => a.left - b.left);
  const out: { from: number; to: number; y: number }[] = [];
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1];
    const b = spans[i];
    if (a && b && b.left - a.right > 2)
      out.push({ from: a.right, to: b.left, y: Math.min(a.y, b.y) });
  }
  return out;
}

function drawJoins(ctx: CanvasRenderingContext2D, onsets: readonly Onset[]): number {
  const sorted = [...onsets].sort((a, b) => a.start - b.start);
  let drawn = 0;
  ctx.save();
  ctx.strokeStyle = JOIN_COLOUR;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i < sorted.length;) {
    const first = sorted[i];
    if (!first) break;
    let j = i + 1;
    while (j < sorted.length && (sorted[j]?.start ?? Infinity) - first.start <= TOGETHER) j++;
    for (const join of joinsOf(sorted.slice(i, j))) {
      const y = Math.round(join.y) - 0.5;
      ctx.beginPath();
      ctx.moveTo(join.from + 2, y);
      ctx.lineTo(join.to - 2, y);
      ctx.stroke();
      drawn += 1;
    }
    i = j;
  }
  ctx.restore();
  return drawn;
}

interface LabelJob {
  pitch: number;
  centre: number;
  baseline: number;
  onBlock: boolean;
  finger: { text: string; suggested: boolean } | null;
  chosen: boolean;
  name: string | null;
  alpha: number;
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

export function keyAt(view: GeometryView, px: number, py: number): number | null {
  const g = geometry(view);
  return keyAtPoint(g.layout, px, py, g.notesHeight + 1, g.keyboardHeight - 1);
}

export function keyTargets(view: GeometryView): string {
  const g = geometry(view);
  const top = g.notesHeight + 1;
  const height = g.keyboardHeight - 1;
  return g.layout.keys
    .map((k) => {
      const y = top + height * (k.black ? BLACK_KEY_HEIGHT_RATIO / 2 : 0.85);
      return `${String(k.pitch)}:${String(Math.round(k.x + k.width / 2))}:${String(Math.round(y))}`;
    })
    .join(' ');
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

  ctx.fillStyle = '#f6f3ff';
  ctx.fillRect(0, 0, BAR_EDGE, height);
  if (view.loop) {
    const y1 = Math.max(0, yOf(view.loop.end));
    const y2 = Math.min(notesHeight, yOf(view.loop.start));
    if (y2 > 0 && y1 < notesHeight) {
      ctx.fillStyle = 'rgba(255, 197, 61, 0.14)';
      ctx.fillRect(BAR_EDGE, y1, width - BAR_EDGE, y2 - y1);
      ctx.fillStyle = '#ffc53d';
      ctx.fillRect(0, y1, BAR_EDGE, y2 - y1);
    }
  }
  ctx.strokeStyle = '#d6cdf5';
  ctx.beginPath();
  ctx.moveTo(BAR_EDGE - 0.5, 0);
  ctx.lineTo(BAR_EDGE - 0.5, notesHeight);
  ctx.stroke();

  ctx.font = '700 11px Nunito Variable, system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'center';
  const barsShown: { index: number; y: number }[] = [];
  perf.bars.forEach((bar, index) => {
    if (bar.end < position || bar.start > top) return;
    barsShown.push({
      index,
      y: Math.round((Math.min(notesHeight, yOf(bar.start)) + Math.max(0, yOf(bar.end))) / 2),
    });
    if (bar.start < position - 0.001) return;
    const y = Math.round(yOf(bar.start)) + 0.5;
    ctx.strokeStyle = '#d6cdf5';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = '#5c5470';
    ctx.fillText(String(bar.number), BAR_EDGE / 2, y - 2);
  });
  ctx.textAlign = 'start';

  const notes = visibleNotes(perf.notes, position, top, longest);
  let fingers = 0;
  let selectedDrawn = 0;
  let suggestedDrawn = 0;
  const blocks: { pitch: number; x: number; y: number }[] = [];
  const labels: LabelJob[] = [];
  const onsets: Onset[] = [];
  for (const n of notes) {
    if (view.hidden.has(view.laneOf(n))) continue;
    const block = blockOf(view, g, n);
    if (!block) continue;
    const colour = view.colours[view.laneOf(n)];
    if (!colour) continue;
    const { key, keyUp, yBottom, h, x, w } = block;
    onsets.push({ start: n.start, lane: view.laneOf(n), left: x, right: x + w, y: yBottom });
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
    ctx.globalAlpha = 1;
    const finger = fingerOf(n, view.userFingers, view.suggested);
    const stack = (finger ? FINGER_PX + 2 : 0) + (view.names ? LABEL_PX : 0);
    if (stack === 0) continue;
    const onBlock = h >= stack + 4 && w >= LABEL_PX;
    labels.push({
      pitch: key.pitch,
      centre: x + w / 2,
      baseline: onBlock ? yBottom - 2 : yBottom - h - 1,
      onBlock,
      finger,
      chosen,
      name: view.names ? pitchName(n.pitch + transpose, view.names.flats) : null,
      alpha,
    });
  }

  const joins = drawJoins(ctx, onsets);

  const taken = new Map<number, [number, number][]>();
  const fits = (pitch: number, top: number, bottom: number) =>
    !(taken.get(pitch) ?? []).some(([t, b]) => top < b && bottom > t);
  const take = (pitch: number, top: number, bottom: number) => {
    taken.set(pitch, [...(taken.get(pitch) ?? []), [top, bottom]]);
  };
  const fingerTop = new Map<LabelJob, number>();
  const byPriority = [...labels.filter((l) => l.chosen), ...labels.filter((l) => !l.chosen)];
  for (const l of byPriority) {
    if (!l.finger) continue;
    const topY = l.baseline - FINGER_PX - 2;
    if (!l.chosen && !fits(l.pitch, topY, l.baseline)) continue;
    ctx.globalAlpha = l.alpha;
    drawFinger(
      ctx,
      l.finger.text,
      l.centre,
      l.baseline,
      l.finger.suggested ? SUGGESTED_COLOUR : FINGER_COLOUR,
    );
    ctx.globalAlpha = 1;
    take(l.pitch, topY, l.baseline);
    fingerTop.set(l, topY);
    if (l.finger.suggested) suggestedDrawn += 1;
    else fingers += 1;
  }
  for (const l of labels) {
    if (l.name === null) continue;
    if (l.finger && !fingerTop.has(l)) continue;
    const baseline = fingerTop.get(l) ?? l.baseline;
    if (!fits(l.pitch, baseline - LABEL_PX, baseline)) continue;
    ctx.globalAlpha = l.alpha;
    drawLabel(ctx, l.name, l.centre, baseline, l.onBlock);
    ctx.globalAlpha = 1;
    take(l.pitch, baseline - LABEL_PX, baseline);
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
  const expected = view.expected ?? new Set<number>();
  const played = view.played ?? new Set<number>();
  const fillOf = (pitch: number, rest: string): string =>
    played.has(pitch)
      ? PLAYED_COLOUR
      : expected.has(pitch)
        ? EXPECTED_FILL
        : (pressed.get(pitch) ?? rest);
  const marker = (k: { x: number; width: number }, y: number, pitch: number) => {
    if (!played.has(pitch)) return;
    ctx.beginPath();
    ctx.arc(k.x + k.width / 2, y, Math.max(3, Math.min(6, k.width / 3)), 0, Math.PI * 2);
    ctx.fillStyle = '#1d1533';
    ctx.fill();
  };
  for (const k of layout.keys) {
    if (k.black) continue;
    ctx.fillStyle = fillOf(k.pitch, '#ffffff');
    ctx.fillRect(k.x, keyTop, k.width, keyHeight);
    ctx.strokeStyle = expected.has(k.pitch) && !played.has(k.pitch) ? EXPECTED_COLOUR : '#1d1533';
    ctx.lineWidth = expected.has(k.pitch) && !played.has(k.pitch) ? 3 : 1;
    ctx.strokeRect(Math.round(k.x) + 0.5, keyTop + 0.5, Math.round(k.width), keyHeight - 1);
    marker(k, keyTop + keyHeight - 14, k.pitch);
    if (k.pitch % 12 === 0 && k.width >= 14) {
      ctx.fillStyle = pressed.has(k.pitch) && !played.has(k.pitch) ? '#ffffff' : '#5c5470';
      ctx.font = `700 ${String(Math.min(11, Math.floor(k.width * 0.55)))}px Nunito Variable, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(noteName(k.pitch), k.x + k.width / 2, keyTop + keyHeight - 4);
      ctx.textAlign = 'start';
    }
  }
  for (const k of layout.keys) {
    if (!k.black) continue;
    ctx.fillStyle = played.has(k.pitch)
      ? PLAYED_COLOUR
      : expected.has(k.pitch)
        ? EXPECTED_COLOUR
        : (pressed.get(k.pitch) ?? '#1d1533');
    roundRect(ctx, k.x, keyTop, k.width, keyHeight * BLACK_KEY_HEIGHT_RATIO, 3);
    ctx.fill();
    if (pressed.has(k.pitch) || played.has(k.pitch) || expected.has(k.pitch)) {
      ctx.strokeStyle = '#1d1533';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    marker(k, keyTop + keyHeight * BLACK_KEY_HEIGHT_RATIO - 10, k.pitch);
  }
  const hands = view.hands ?? [];
  if (hands.length > 0)
    drawHands(ctx, hands, position, {
      keyTop,
      keyHeight,
      whiteWidth: layout.whiteWidth,
      left: BAR_EDGE,
    });
  return {
    pressed,
    fingers,
    suggested: suggestedDrawn,
    selected: selectedDrawn,
    chords: chordsDrawn,
    hands,
    blocks,
    bars: barsShown,
    joins,
  };
}

export function barEdgeAt(
  view: GeometryView & Pick<FallingView, 'perf' | 'position'>,
  px: number,
  py: number,
): number | null {
  const g = geometry(view);
  if (px < 0 || px >= BAR_EDGE || py < 0 || py >= g.notesHeight) return null;
  return barAt(view.perf, view.position + (g.notesHeight - py) / Math.max(1, g.pxPerSecond));
}
