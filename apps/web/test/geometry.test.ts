import type { AnnotationItem } from '@pcaa/shared';
import { describe, expect, it } from 'vitest';
import {
  arrowHead,
  boundsOf,
  distanceToSegment,
  hitTest,
  outlinePath,
  polylinePath,
  topHit,
  translate,
} from '../src/annotate/geometry.ts';

const stroke: AnnotationItem = {
  kind: 'stroke',
  id: 's',
  colour: '#000000',
  tool: 'pen',
  size: 4,
  points: [
    [0, 0, 0.5],
    [100, 0, 0.5],
  ],
};
const rect: AnnotationItem = {
  kind: 'shape',
  id: 'r',
  colour: '#000000',
  shape: 'rect',
  x1: 10,
  y1: 10,
  x2: 50,
  y2: 30,
  size: 2,
};
const ellipse: AnnotationItem = {
  kind: 'shape',
  id: 'e',
  colour: '#000000',
  shape: 'ellipse',
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 50,
  size: 2,
};
const arrow: AnnotationItem = {
  kind: 'shape',
  id: 'a',
  colour: '#000000',
  shape: 'arrow',
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 0,
  size: 2,
};
const text: AnnotationItem = {
  kind: 'text',
  id: 't',
  colour: '#000000',
  x: 0,
  y: 0,
  text: 'hello\nworld',
  size: 10,
};
const stamp: AnnotationItem = {
  kind: 'stamp',
  id: 'p',
  colour: '#000000',
  glyph: '3',
  x: 50,
  y: 50,
  size: 20,
};

describe('geometry', () => {
  it('measures distance to a segment, including past its ends', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it('hits strokes near their line but not far away', () => {
    expect(hitTest(stroke, { x: 50, y: 3 }, 2)).toBe(true);
    expect(hitTest(stroke, { x: 50, y: 10 }, 2)).toBe(false);
    expect(hitTest({ ...stroke, points: [[5, 5, 0.5]] }, { x: 6, y: 6 }, 2)).toBe(true);
  });

  it('hits a rectangle on its outline only', () => {
    expect(hitTest(rect, { x: 10, y: 20 }, 1)).toBe(true);
    expect(hitTest(rect, { x: 30, y: 20 }, 1)).toBe(false);
  });

  it('hits an ellipse near its rim', () => {
    expect(hitTest(ellipse, { x: 50, y: 0 }, 2)).toBe(true);
    expect(hitTest(ellipse, { x: 50, y: 25 }, 2)).toBe(false);
    expect(hitTest({ ...ellipse, y2: 0 }, { x: 50, y: 1 }, 2)).toBe(true);
  });

  it('hits lines, text and stamps', () => {
    expect(hitTest(arrow, { x: 5, y: 1 }, 1)).toBe(true);
    expect(hitTest(text, { x: 20, y: 15 }, 0)).toBe(true);
    expect(hitTest(stamp, { x: 58, y: 42 }, 0)).toBe(true);
    expect(hitTest(stamp, { x: 80, y: 80 }, 0)).toBe(false);
  });

  it('picks the topmost item', () => {
    expect(topHit([rect, { ...stamp, x: 10, y: 20 }], { x: 10, y: 20 }, 1)?.id).toBe('p');
    expect(topHit([rect], { x: 300, y: 300 }, 1)).toBeNull();
  });

  it('measures bounds for every kind', () => {
    expect(boundsOf(stroke)).toEqual({ x: 0, y: 0, width: 100, height: 0 });
    expect(boundsOf({ ...rect, x1: 50, x2: 10 })).toMatchObject({ x: 10, width: 40 });
    expect(boundsOf(text).height).toBe(25);
    expect(boundsOf(stamp)).toEqual({ x: 40, y: 40, width: 20, height: 20 });
  });

  it('translates every kind', () => {
    expect(translate(stroke, 1, 2)).toMatchObject({
      points: [
        [1, 2, 0.5],
        [101, 2, 0.5],
      ],
    });
    expect(translate(rect, 1, 1)).toMatchObject({ x1: 11, y2: 31 });
    expect(translate(text, -1, 0)).toMatchObject({ x: -1 });
  });

  it('builds SVG paths', () => {
    expect(
      outlinePath(
        [
          [0, 0, 0.5],
          [10, 10, 0.5],
          [20, 5, 0.5],
        ],
        4,
      ),
    ).toMatch(/^M.*Z$/);
    expect(outlinePath([], 4)).toBe('');
    expect(
      polylinePath([
        [0, 0, 0.5],
        [1.234, 2, 0.5],
      ]),
    ).toBe('M0 0 L1.23 2');
    expect(arrowHead({ x1: 0, y1: 0, x2: 10, y2: 0, size: 2 })).toMatch(/^M.* L10 0 L/);
  });
});
