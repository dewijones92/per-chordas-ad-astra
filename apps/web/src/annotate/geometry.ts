import type { AnnotationItem, InkItem, ShapeItem, StrokeItem } from '@pcaa/shared';
import { getStroke } from 'perfect-freehand';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function textBox(item: { x: number; y: number; size: number; text: string }): Box {
  const lines = item.text.split('\n');
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return {
    x: item.x,
    y: item.y,
    width: longest * item.size * 0.6,
    height: lines.length * item.size * 1.25,
  };
}

export function stampBox(item: { x: number; y: number; size: number }): Box {
  return {
    x: item.x - item.size / 2,
    y: item.y - item.size / 2,
    width: item.size,
    height: item.size,
  };
}

function shapeBox(item: ShapeItem): Box {
  return {
    x: Math.min(item.x1, item.x2),
    y: Math.min(item.y1, item.y2),
    width: Math.abs(item.x2 - item.x1),
    height: Math.abs(item.y2 - item.y1),
  };
}

function strokeBox(item: StrokeItem): Box {
  const xs = item.points.map((p) => p[0]);
  const ys = item.points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function inkBox(item: InkItem): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of item.paths)
    for (const [x, y] of path) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function insideInk(item: InkItem, p: Point): boolean {
  let winding = 0;
  let crossings = 0;
  for (const path of item.paths) {
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      if (!a || !b) continue;
      const [ax, ay] = a;
      const [bx, by] = b;
      if (ay <= p.y === by <= p.y) continue;
      const x = ax + ((p.y - ay) / (by - ay)) * (bx - ax);
      if (x <= p.x) continue;
      crossings++;
      winding += by > ay ? 1 : -1;
    }
  }
  return item.fillRule === 'evenodd' ? crossings % 2 === 1 : winding !== 0;
}

function nearInkEdge(item: InkItem, p: Point, reach: number): boolean {
  for (const path of item.paths)
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      if (a && b && distanceToSegment(p, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) <= reach)
        return true;
    }
  return false;
}

export function boundsOf(item: AnnotationItem): Box {
  switch (item.kind) {
    case 'stroke':
      return strokeBox(item);
    case 'shape':
      return shapeBox(item);
    case 'text':
      return textBox(item);
    case 'stamp':
      return stampBox(item);
    case 'ink':
      return inkBox(item);
  }
}

function inBox(p: Point, box: Box, pad: number): boolean {
  return (
    p.x >= box.x - pad &&
    p.x <= box.x + box.width + pad &&
    p.y >= box.y - pad &&
    p.y <= box.y + box.height + pad
  );
}

export function hitTest(item: AnnotationItem, p: Point, tolerance: number): boolean {
  switch (item.kind) {
    case 'stroke': {
      const reach = tolerance + item.size / 2;
      const pts = item.points;
      if (pts.length === 1) {
        const [only] = pts;
        return only !== undefined && Math.hypot(p.x - only[0], p.y - only[1]) <= reach;
      }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a && b && distanceToSegment(p, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) <= reach)
          return true;
      }
      return false;
    }
    case 'shape': {
      const reach = tolerance + item.size / 2;
      const a = { x: item.x1, y: item.y1 };
      const b = { x: item.x2, y: item.y2 };
      if (item.shape === 'line' || item.shape === 'arrow')
        return distanceToSegment(p, a, b) <= reach;
      const box = shapeBox(item);
      if (item.shape === 'rect') {
        const corners = [
          { x: box.x, y: box.y },
          { x: box.x + box.width, y: box.y },
          { x: box.x + box.width, y: box.y + box.height },
          { x: box.x, y: box.y + box.height },
        ];
        return corners.some((c, i) => distanceToSegment(p, c, corners[(i + 1) % 4] ?? c) <= reach);
      }
      const rx = box.width / 2;
      const ry = box.height / 2;
      if (rx === 0 || ry === 0) return distanceToSegment(p, a, b) <= reach;
      const nx = (p.x - (box.x + rx)) / rx;
      const ny = (p.y - (box.y + ry)) / ry;
      const radial = Math.hypot(nx, ny);
      return Math.abs(radial - 1) * Math.min(rx, ry) <= reach;
    }
    case 'text':
      return inBox(p, textBox(item), tolerance);
    case 'stamp':
      return inBox(p, stampBox(item), tolerance);
    case 'ink':
      return (
        inBox(p, inkBox(item), tolerance) && (insideInk(item, p) || nearInkEdge(item, p, tolerance))
      );
  }
}

export function topHit(
  items: readonly AnnotationItem[],
  p: Point,
  tolerance: number,
): AnnotationItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item && hitTest(item, p, tolerance)) return item;
  }
  return null;
}

export function translate(item: AnnotationItem, dx: number, dy: number): AnnotationItem {
  switch (item.kind) {
    case 'stroke':
      return {
        ...item,
        points: item.points.map(([x, y, pr]) => [x + dx, y + dy, pr] as [number, number, number]),
      };
    case 'shape':
      return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy };
    case 'text':
    case 'stamp':
      return { ...item, x: item.x + dx, y: item.y + dy };
    case 'ink':
      return {
        ...item,
        paths: item.paths.map((path) =>
          path.map(([x, y]) => [round2(x + dx), round2(y + dy)] as [number, number]),
        ),
      };
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function outlinePath(
  points: readonly (readonly [number, number, number])[],
  size: number,
): string {
  const outline = getStroke(
    points.map((p) => [p[0], p[1], p[2]]),
    {
      size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: points.every((p) => p[2] === 0.5),
    },
  );
  if (outline.length === 0) return '';
  const first = outline[0];
  if (!first) return '';
  let d = `M${round2(first[0]).toString()} ${round2(first[1]).toString()} Q`;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (!a || !b) continue;
    d += `${round2(a[0]).toString()} ${round2(a[1]).toString()} ${round2((a[0] + b[0]) / 2).toString()} ${round2((a[1] + b[1]) / 2).toString()} `;
  }
  return `${d}Z`;
}

export function polylinePath(points: readonly (readonly [number, number, number])[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${round2(p[0]).toString()} ${round2(p[1]).toString()}`)
    .join(' ');
}

export function arrowHead(item: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
}): string {
  const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
  const length = 6 + item.size * 3;
  const spread = Math.PI / 7;
  const a = {
    x: item.x2 - length * Math.cos(angle - spread),
    y: item.y2 - length * Math.sin(angle - spread),
  };
  const b = {
    x: item.x2 - length * Math.cos(angle + spread),
    y: item.y2 - length * Math.sin(angle + spread),
  };
  return `M${round2(a.x).toString()} ${round2(a.y).toString()} L${round2(item.x2).toString()} ${round2(item.y2).toString()} L${round2(b.x).toString()} ${round2(b.y).toString()}`;
}

export function inkPath(paths: readonly (readonly (readonly [number, number])[])[]): string {
  return paths
    .map(
      (path) =>
        path
          .map(
            ([x, y], i) => `${i === 0 ? 'M' : 'L'}${round2(x).toString()} ${round2(y).toString()}`,
          )
          .join('') + 'Z',
    )
    .join(' ');
}
