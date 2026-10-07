import { newId, type AnnotationItem, type ShapeItem, type StrokeItem } from '@pcaa/shared';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  arrowHead,
  boundsOf,
  outlinePath,
  polylinePath,
  round2,
  topHit,
  translate,
  type Point,
} from './geometry.ts';
import type { HistoryAction } from './history.ts';
import { SIZES, type ToolState } from './tools.ts';

export interface TextEditRequest {
  page: number;
  x: number;
  y: number;
  item: Extract<AnnotationItem, { kind: 'text' }> | null;
}

interface Props {
  page: number;
  width: number;
  height: number;
  scale: number;
  items: readonly AnnotationItem[];
  tools: ToolState;
  dispatch: (action: HistoryAction) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onEditText: (request: TextEditRequest) => void;
}

type Gesture =
  | { kind: 'stroke'; item: StrokeItem }
  | { kind: 'shape'; item: ShapeItem }
  | { kind: 'erase'; group: string }
  | { kind: 'move'; group: string; item: AnnotationItem; from: Point; moved: boolean }
  | null;

function toPoint(svg: SVGSVGElement, event: ReactPointerEvent | PointerEvent): Point {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: round2(p.x), y: round2(p.y) };
}

function ShapeView({ item }: { item: ShapeItem }) {
  const common = {
    stroke: item.colour,
    strokeWidth: item.size,
    fill: 'none',
    strokeLinecap: 'round' as const,
  };
  switch (item.shape) {
    case 'line':
      return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} {...common} />;
    case 'arrow':
      return (
        <g>
          <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} {...common} />
          <path d={arrowHead(item)} {...common} strokeLinejoin="round" />
        </g>
      );
    case 'rect': {
      const b = boundsOf(item);
      return <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={3} {...common} />;
    }
    case 'ellipse': {
      const b = boundsOf(item);
      return (
        <ellipse
          cx={b.x + b.width / 2}
          cy={b.y + b.height / 2}
          rx={b.width / 2}
          ry={b.height / 2}
          {...common}
        />
      );
    }
  }
}

export function ItemView({ item, selected = false }: { item: AnnotationItem; selected?: boolean }) {
  const body = (() => {
    switch (item.kind) {
      case 'stroke':
        return item.tool === 'pen' ? (
          <path d={outlinePath(item.points, item.size)} fill={item.colour} />
        ) : (
          <path
            d={polylinePath(item.points)}
            fill="none"
            stroke={item.colour}
            strokeWidth={item.size}
            strokeOpacity={0.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ mixBlendMode: 'multiply' }}
          />
        );
      case 'shape':
        return <ShapeView item={item} />;
      case 'text':
        return (
          <text
            x={item.x}
            y={item.y}
            fill={item.colour}
            fontSize={item.size}
            fontWeight={700}
            fontFamily="var(--font-body)"
            dominantBaseline="hanging"
            stroke="#ffffff"
            strokeWidth={item.size / 6}
            paintOrder="stroke"
          >
            {item.text.split('\n').map((line, i) => (
              <tspan key={i} x={item.x} dy={i === 0 ? 0 : item.size * 1.25}>
                {line || ' '}
              </tspan>
            ))}
          </text>
        );
      case 'stamp':
        return (
          <text
            x={item.x}
            y={item.y}
            fill={item.colour}
            fontSize={item.size}
            fontWeight={900}
            fontFamily="var(--font-display)"
            textAnchor="middle"
            dominantBaseline="central"
            stroke="#ffffff"
            strokeWidth={item.size / 5}
            paintOrder="stroke"
          >
            {item.glyph}
          </text>
        );
    }
  })();
  if (!selected) return <g data-item={item.id}>{body}</g>;
  const b = boundsOf(item);
  return (
    <g data-item={item.id}>
      {body}
      <rect
        x={b.x - 4}
        y={b.y - 4}
        width={b.width + 8}
        height={b.height + 8}
        fill="none"
        stroke="var(--sky)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

export function AnnotationLayer(props: Props) {
  const { page, width, height, scale, items, tools, dispatch, selected, onSelect, onEditText } =
    props;
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture>(null);
  const [draft, setDraft] = useState<AnnotationItem | null>(null);
  const tolerance = 6 / scale;

  const finish = () => {
    const g = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (!g) return;
    if (g.kind === 'stroke') {
      dispatch({ type: 'add', page, item: g.item });
      console.info('dewidebug annotate stroke', {
        page,
        tool: g.item.tool,
        points: g.item.points.length,
      });
    } else if (g.kind === 'shape') {
      if (Math.hypot(g.item.x2 - g.item.x1, g.item.y2 - g.item.y1) > 3)
        dispatch({ type: 'add', page, item: g.item });
    } else {
      dispatch({ type: 'end-group' });
    }
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !svgRef.current) return;
    const svg = svgRef.current;
    const p = toPoint(svg, event);
    const pressure = event.pointerType === 'mouse' ? 0.5 : round2(event.pressure || 0.5);
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
    switch (tools.tool) {
      case 'pen':
      case 'highlighter': {
        const item: StrokeItem = {
          kind: 'stroke',
          id: newId(),
          tool: tools.tool,
          colour: tools.tool === 'pen' ? tools.colour : tools.highlightColour,
          size: SIZES[tools.tool][tools.size],
          points: [[p.x, p.y, pressure]],
        };
        gesture.current = { kind: 'stroke', item };
        setDraft(item);
        return;
      }
      case 'eraser': {
        const group = `erase-${newId()}`;
        gesture.current = { kind: 'erase', group };
        const hit = topHit(items, p, tolerance);
        if (hit) dispatch({ type: 'remove', page, ids: [hit.id], group });
        return;
      }
      case 'stamp':
        dispatch({
          type: 'add',
          page,
          item: {
            kind: 'stamp',
            id: newId(),
            colour: tools.colour,
            glyph: tools.glyph,
            x: p.x,
            y: p.y,
            size: SIZES.stamp[tools.size],
          },
        });
        return;
      case 'text': {
        const hit = topHit(items, p, tolerance);
        onEditText({ page, x: p.x, y: p.y, item: hit?.kind === 'text' ? hit : null });
        return;
      }
      case 'select': {
        const hit = topHit(items, p, tolerance);
        onSelect(hit?.id ?? null);
        if (hit)
          gesture.current = {
            kind: 'move',
            group: `move-${newId()}`,
            item: hit,
            from: p,
            moved: false,
          };
        return;
      }
      case 'line':
      case 'arrow':
      case 'rect':
      case 'ellipse': {
        const item: ShapeItem = {
          kind: 'shape',
          id: newId(),
          shape: tools.tool,
          colour: tools.colour,
          size: SIZES.shape[tools.size],
          x1: p.x,
          y1: p.y,
          x2: p.x,
          y2: p.y,
        };
        gesture.current = { kind: 'shape', item };
        setDraft(item);
        return;
      }
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || !svgRef.current) return;
    const svg = svgRef.current;
    const coalesced =
      'getCoalescedEvents' in event.nativeEvent ? event.nativeEvent.getCoalescedEvents() : [];
    const events = coalesced.length > 0 ? coalesced : [event.nativeEvent];
    if (g.kind === 'stroke') {
      const points = [...g.item.points];
      for (const e of events) {
        const p = toPoint(svg, e);
        const last = points.at(-1);
        if (last && Math.hypot(p.x - last[0], p.y - last[1]) < 0.6) continue;
        points.push([p.x, p.y, e.pointerType === 'mouse' ? 0.5 : round2(e.pressure || 0.5)]);
      }
      if (points.length > 5000) return;
      g.item = { ...g.item, points };
      setDraft(g.item);
    } else if (g.kind === 'shape') {
      const p = toPoint(svg, event);
      g.item = { ...g.item, x2: p.x, y2: p.y };
      setDraft(g.item);
    } else if (g.kind === 'erase') {
      const ids = new Set<string>();
      for (const e of events) {
        const hit = topHit(items, toPoint(svg, e), tolerance);
        if (hit) ids.add(hit.id);
      }
      if (ids.size > 0) dispatch({ type: 'remove', page, ids: [...ids], group: g.group });
    } else {
      const p = toPoint(svg, event);
      const dx = p.x - g.from.x;
      const dy = p.y - g.from.y;
      if (!g.moved && Math.hypot(dx, dy) < 2) return;
      g.moved = true;
      dispatch({
        type: 'update',
        page,
        item: translate(g.item, round2(dx), round2(dy)),
        group: g.group,
      });
    }
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (tools.tool !== 'select' || !svgRef.current) return;
    const matrix = svgRef.current.getScreenCTM();
    if (!matrix) return;
    const raw = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const hit = topHit(items, { x: raw.x, y: raw.y }, tolerance);
    if (hit?.kind === 'text') onEditText({ page, x: hit.x, y: hit.y, item: hit });
  };

  const cursor =
    tools.tool === 'select'
      ? 'default'
      : tools.tool === 'text'
        ? 'text'
        : tools.tool === 'eraser'
          ? 'cell'
          : 'crosshair';

  return (
    <svg
      ref={svgRef}
      className="annotation-layer"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      preserveAspectRatio="none"
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={onDoubleClick}
      data-testid={`annotation-layer-${String(page)}`}
      data-items={items.length}
    >
      {items.map((item) => (
        <ItemView key={item.id} item={item} selected={item.id === selected} />
      ))}
      {draft && <ItemView item={draft} />}
    </svg>
  );
}
