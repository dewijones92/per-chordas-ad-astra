import {
  newId,
  PDF_MARKS_VERSION,
  type AnnotationItem,
  type InkItem,
  type PdfImportRequest,
  type ShapeItem,
  type StrokeItem,
  type TextItem,
} from '@pcaa/shared';
import { round2 } from '../annotate/geometry.ts';

type Matrix = [number, number, number, number, number, number];

export interface MarksLibrary {
  OPS: Readonly<Record<string, number>>;
  AnnotationMode: Readonly<{ ENABLE: number }>;
}

export interface MarksPage {
  getAnnotations(): Promise<unknown[]>;
  getOperatorList(options: { annotationMode: number; intent: string }): Promise<{
    fnArray: number[];
    argsArray: unknown[];
  }>;
  getViewport(options: { scale: number }): { transform: number[] };
}

interface RawAnnotation {
  id: string;
  subtype: string;
  annotationFlags?: number;
  rect: ArrayLike<number>;
  color?: ArrayLike<number> | null;
  quadPoints?: ArrayLike<number> | null;
  lineCoordinates?: ArrayLike<number> | null;
  borderStyle?: { width?: number } | null;
  contentsObj?: { str?: string } | null;
  textContent?: string[] | null;
  defaultAppearanceData?: { fontSize?: number; fontColor?: ArrayLike<number> | null } | null;
}

export type MarksResult = PdfImportRequest & { found: Record<string, number> };

const HIDDEN = 0x02;
const NO_VIEW = 0x20;
const IGNORED = new Set(['Link', 'Popup']);
const FROM_APPEARANCE = new Set(['Stamp', 'Ink', 'Square', 'Circle', 'Polygon', 'PolyLine']);
const QUADS = new Set(['Highlight', 'StrikeOut', 'Underline', 'Squiggly']);
const UNCONVERTIBLE_OPS = new Set([
  'showText',
  'showSpacedText',
  'nextLineShowText',
  'nextLineSetSpacingShowText',
  'paintImageXObject',
  'paintInlineImageXObject',
  'paintInlineImageXObjectGroup',
  'paintImageXObjectRepeat',
  'paintImageMaskXObject',
  'paintImageMaskXObjectGroup',
  'paintImageMaskXObjectRepeat',
  'paintSolidColorImageMask',
  'shadingFill',
]);
const MAX_POINTS = 5000;
const MAX_PATHS = 200;
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

const identity = (): Matrix => [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: ArrayLike<number>): Matrix {
  const [b0 = 1, b1 = 0, b2 = 0, b3 = 1, b4 = 0, b5 = 0] = Array.from(b);
  return [
    a[0] * b0 + a[2] * b1,
    a[1] * b0 + a[3] * b1,
    a[0] * b2 + a[2] * b3,
    a[1] * b2 + a[3] * b3,
    a[0] * b4 + a[2] * b5 + a[4],
    a[1] * b4 + a[3] * b5 + a[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [round2(m[0] * x + m[2] * y + m[4]), round2(m[1] * x + m[3] * y + m[5])];
}

function hex(rgb: ArrayLike<number> | null | undefined, fallback = '#000000'): string {
  if (!rgb || rgb.length < 3) return fallback;
  return `#${Array.from(rgb)
    .slice(0, 3)
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function colourArg(args: unknown): string | null {
  if (!Array.isArray(args)) return null;
  const [first] = args as unknown[];
  if (typeof first === 'string' && /^#[0-9a-f]{6}$/i.test(first)) return first.toLowerCase();
  if (args.length >= 3 && args.every((v) => typeof v === 'number')) return hex(args);
  return null;
}

function flatten(data: ArrayLike<number>, m: Matrix): [number, number][][] {
  const paths: [number, number][][] = [];
  let current: [number, number][] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const push = (px: number, py: number) => {
    const p = apply(m, px, py);
    const last = current.at(-1);
    if (last?.[0] === p[0] && last[1] === p[1]) return;
    current.push(p);
  };
  const close = () => {
    if (current.length >= 2) paths.push(current);
    current = [];
  };
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    const at = (k: number) => data[i + k] ?? 0;
    if (op === DRAW.moveTo) {
      close();
      x = startX = at(0);
      y = startY = at(1);
      i += 2;
      push(x, y);
    } else if (op === DRAW.lineTo) {
      x = at(0);
      y = at(1);
      i += 2;
      push(x, y);
    } else if (op === DRAW.curveTo || op === DRAW.quadraticCurveTo) {
      const cubic = op === DRAW.curveTo;
      const [c1x, c1y, c2x, c2y, ex, ey] = cubic
        ? [at(0), at(1), at(2), at(3), at(4), at(5)]
        : [
            x + (2 / 3) * (at(0) - x),
            y + (2 / 3) * (at(1) - y),
            at(2) + (2 / 3) * (at(0) - at(2)),
            at(3) + (2 / 3) * (at(1) - at(3)),
            at(2),
            at(3),
          ];
      i += cubic ? 6 : 4;
      const steps = Math.max(2, Math.min(16, Math.ceil(Math.hypot(ex - x, ey - y) / 1.5)));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        push(
          u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
          u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
        );
      }
      x = ex;
      y = ey;
    } else if (op === DRAW.closePath) {
      x = startX;
      y = startY;
      close();
    } else {
      throw new Error(`unknown path operator ${String(op)}`);
    }
  }
  close();
  return paths.map((path) => {
    if (path.length <= MAX_POINTS) return path;
    const step = Math.ceil(path.length / MAX_POINTS);
    return path.filter((_, k) => k % step === 0);
  });
}

function pathData(args: unknown): ArrayLike<number> | null {
  if (!Array.isArray(args)) return null;
  const [, holder] = args as unknown[];
  const data: unknown = Array.isArray(holder) ? (holder as unknown[])[0] : holder;
  if (ArrayBuffer.isView(data) || Array.isArray(data)) return data as ArrayLike<number>;
  return null;
}

interface PaintState {
  ctm: Matrix;
  fill: string;
  stroke: string;
  lineWidth: number;
}

interface AppearanceResult {
  items: Map<string, AnnotationItem[]>;
  problems: Map<string, string>;
}

async function fromAppearances(
  page: MarksPage,
  lib: MarksLibrary,
  viewport: Matrix,
  wanted: ReadonlySet<string>,
  makeId: () => string,
): Promise<AppearanceResult> {
  const names = new Map(Object.entries(lib.OPS).map(([k, v]) => [v, k]));
  const list = await page.getOperatorList({
    annotationMode: lib.AnnotationMode.ENABLE,
    intent: 'display',
  });
  const items = new Map<string, AnnotationItem[]>();
  const problems = new Map<string, string>();
  let id: string | null = null;
  let state: PaintState = { ctm: identity(), fill: '#000000', stroke: '#000000', lineWidth: 1 };
  const stack: PaintState[] = [];
  const add = (item: AnnotationItem) => {
    if (id === null) return;
    items.set(id, [...(items.get(id) ?? []), item]);
  };
  for (let i = 0; i < list.fnArray.length; i++) {
    const name = names.get(list.fnArray[i] ?? -1) ?? '?';
    const args = list.argsArray[i];
    if (name === 'beginAnnotation') {
      const [annotationId, , transform, matrix] = args as [string, unknown, number[], number[]];
      id = wanted.has(annotationId) ? annotationId : null;
      stack.length = 0;
      state = {
        ctm: multiply(multiply(viewport, transform), matrix),
        fill: '#000000',
        stroke: '#000000',
        lineWidth: 1,
      };
      continue;
    }
    if (name === 'endAnnotation') {
      id = null;
      continue;
    }
    if (id === null) continue;
    if (UNCONVERTIBLE_OPS.has(name)) {
      problems.set(id, name);
      continue;
    }
    switch (name) {
      case 'save':
        stack.push({ ...state });
        break;
      case 'restore':
        state = stack.pop() ?? state;
        break;
      case 'transform':
        state = { ...state, ctm: multiply(state.ctm, args as number[]) };
        break;
      case 'paintFormXObjectBegin': {
        const [matrix] = args as [number[] | null];
        stack.push({ ...state });
        if (matrix) state = { ...state, ctm: multiply(state.ctm, matrix) };
        break;
      }
      case 'paintFormXObjectEnd':
        state = stack.pop() ?? state;
        break;
      case 'setFillRGBColor':
        state = { ...state, fill: colourArg(args) ?? state.fill };
        break;
      case 'setStrokeRGBColor':
        state = { ...state, stroke: colourArg(args) ?? state.stroke };
        break;
      case 'setLineWidth':
        state = { ...state, lineWidth: Number((args as number[])[0]) || 1 };
        break;
      case 'constructPath': {
        const paint = names.get((args as number[])[0] ?? -1) ?? '';
        const data = pathData(args);
        if (!data || paint === 'endPath') break;
        const paths = flatten(data, state.ctm);
        if (paths.length === 0) break;
        const filled = /fill/i.test(paint);
        const stroked = /stroke/i.test(paint);
        if (filled) {
          const fillRule = /eo/i.test(paint) ? 'evenodd' : 'nonzero';
          for (let k = 0; k < paths.length; k += MAX_PATHS) {
            const ink: InkItem = {
              kind: 'ink',
              id: makeId(),
              colour: state.fill,
              fillRule,
              paths: paths.slice(k, k + MAX_PATHS),
            };
            add(ink);
          }
        }
        if (stroked) {
          const scale = Math.sqrt(
            Math.abs(state.ctm[0] * state.ctm[3] - state.ctm[1] * state.ctm[2]),
          );
          const size = Math.min(60, Math.max(0.5, round2(state.lineWidth * scale)));
          for (const path of paths) {
            const closed = /close/i.test(paint) && path[0] ? [...path, path[0]] : path;
            const stroke: StrokeItem = {
              kind: 'stroke',
              id: makeId(),
              tool: 'pen',
              colour: state.stroke,
              size,
              points: closed.slice(0, MAX_POINTS).map(([x, y]) => [x, y, 0.5]),
            };
            add(stroke);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return { items, problems };
}

function quads(
  a: RawAnnotation,
  viewport: Matrix,
): { x1: number; x2: number; y1: number; y2: number }[] {
  const q = a.quadPoints ? Array.from(a.quadPoints) : [];
  const out: { x1: number; x2: number; y1: number; y2: number }[] = [];
  for (let i = 0; i + 7 < q.length; i += 8) {
    const pts = [0, 2, 4, 6].map((k) => apply(viewport, q[i + k] ?? 0, q[i + k + 1] ?? 0));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    out.push({
      x1: Math.min(...xs),
      x2: Math.max(...xs),
      y1: Math.min(...ys),
      y2: Math.max(...ys),
    });
  }
  return out;
}

function fromQuads(a: RawAnnotation, viewport: Matrix, makeId: () => string): AnnotationItem[] {
  const colour = hex(a.color, '#ffd400');
  return quads(a, viewport).map((b): AnnotationItem => {
    const height = Math.max(0.5, round2(b.y2 - b.y1));
    const mid = round2((b.y1 + b.y2) / 2);
    if (a.subtype === 'Highlight') {
      const inset = Math.min(height / 2, (b.x2 - b.x1) / 2);
      const highlight: StrokeItem = {
        kind: 'stroke',
        id: makeId(),
        tool: 'highlighter',
        colour,
        size: Math.min(60, height),
        points: [
          [round2(b.x1 + inset), mid, 0.5],
          [round2(b.x2 - inset), mid, 0.5],
        ],
      };
      return highlight;
    }
    const y = a.subtype === 'StrikeOut' ? mid : round2(b.y2 - height * 0.1);
    const line: ShapeItem = {
      kind: 'shape',
      id: makeId(),
      shape: 'line',
      colour,
      size: Math.min(30, Math.max(0.5, round2(height * 0.08))),
      x1: round2(b.x1),
      y1: y,
      x2: round2(b.x2),
      y2: y,
    };
    return line;
  });
}

function fromLine(a: RawAnnotation, viewport: Matrix, makeId: () => string): AnnotationItem[] {
  const c = a.lineCoordinates ? Array.from(a.lineCoordinates) : [];
  if (c.length < 4) return [];
  const [x1, y1] = apply(viewport, c[0] ?? 0, c[1] ?? 0);
  const [x2, y2] = apply(viewport, c[2] ?? 0, c[3] ?? 0);
  const width = a.borderStyle?.width ?? 1;
  const line: ShapeItem = {
    kind: 'shape',
    id: makeId(),
    shape: 'line',
    colour: hex(a.color),
    size: Math.min(30, Math.max(0.5, round2(width || 1))),
    x1,
    y1,
    x2,
    y2,
  };
  return [line];
}

function fromFreeText(a: RawAnnotation, viewport: Matrix, makeId: () => string): AnnotationItem[] {
  const own = a.contentsObj?.str?.trim() ?? '';
  const text = (own !== '' ? own : (a.textContent ?? []).join('\n').trim()).slice(0, 2000);
  if (!text) return [];
  const r = Array.from(a.rect);
  const [ax, ay] = apply(viewport, r[0] ?? 0, r[1] ?? 0);
  const [bx, by] = apply(viewport, r[2] ?? 0, r[3] ?? 0);
  const item: TextItem = {
    kind: 'text',
    id: makeId(),
    colour: hex(a.defaultAppearanceData?.fontColor ?? a.color),
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    text,
    size: Math.min(96, Math.max(4, round2(a.defaultAppearanceData?.fontSize ?? 12))),
  };
  return [item];
}

function convertOne(
  a: RawAnnotation,
  appearance: AppearanceResult,
  viewport: Matrix,
  makeId: () => string,
): AnnotationItem[] | string {
  if (FROM_APPEARANCE.has(a.subtype)) {
    const problem = appearance.problems.get(a.id);
    return problem ? `${a.subtype} drawn with ${problem}` : (appearance.items.get(a.id) ?? []);
  }
  if (QUADS.has(a.subtype)) return fromQuads(a, viewport, makeId);
  if (a.subtype === 'Line') return fromLine(a, viewport, makeId);
  if (a.subtype === 'FreeText') return fromFreeText(a, viewport, makeId);
  return a.subtype;
}

export async function extractPdfMarks(
  pages: readonly MarksPage[],
  lib: MarksLibrary,
  makeId: () => string = newId,
): Promise<MarksResult> {
  const result: MarksResult = {
    version: PDF_MARKS_VERSION,
    pages: {},
    converted: 0,
    hidePdfAnnotations: false,
    skipped: [],
    found: {},
  };
  const skipped = new Set<string>();
  for (const [index, page] of pages.entries()) {
    const number = index + 1;
    const viewport = Array.from(page.getViewport({ scale: 1 }).transform) as Matrix;
    const annotations = (await page.getAnnotations()) as RawAnnotation[];
    const visible = annotations.filter(
      (a) => !IGNORED.has(a.subtype) && ((a.annotationFlags ?? 0) & (HIDDEN | NO_VIEW)) === 0,
    );
    if (visible.length === 0) continue;
    for (const a of visible) result.found[a.subtype] = (result.found[a.subtype] ?? 0) + 1;
    const fromAp = new Set(visible.filter((a) => FROM_APPEARANCE.has(a.subtype)).map((a) => a.id));
    const appearance =
      fromAp.size > 0
        ? await fromAppearances(page, lib, viewport, fromAp, makeId)
        : { items: new Map<string, AnnotationItem[]>(), problems: new Map<string, string>() };
    const items: AnnotationItem[] = [];
    for (const a of visible) {
      const converted = convertOne(a, appearance, viewport, makeId);
      if (typeof converted === 'string') {
        skipped.add(`${converted} (page ${String(number)})`);
        continue;
      }
      items.push(...converted);
      result.converted++;
    }
    if (items.length > 0) result.pages[String(number)] = items;
  }
  if (skipped.size > 0) {
    return { ...result, pages: {}, converted: 0, skipped: [...skipped].slice(0, 20) };
  }
  return { ...result, hidePdfAnnotations: result.converted > 0 };
}
