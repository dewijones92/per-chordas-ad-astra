import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AnnotationLayer } from '../annotate/AnnotationLayer.tsx';
import { itemsOn, type History, type HistoryAction } from '../annotate/history.ts';
import { useTextEditing } from '../annotate/TextEditor.tsx';
import type { ToolState } from '../annotate/tools.ts';
import { useWheelZoom } from '../score/use-wheel-zoom.ts';
import { ZoomControl } from '../score/ZoomControl.tsx';
import { strings, tips } from '../strings.ts';
import { intervalFor } from './keys.ts';
import { TPQ, type ScoreMeasure } from './model.ts';
import { soundingIds, type NotationRequest, type NotationResult } from './notation-protocol.ts';
import { barAt, type Performance } from './performance.ts';

const BASE_SCALE = 38;
export const DRAW_MIN_ZOOM = 1.5;
const MARK_SIZE = 2.5;
const SCROLL_LEAD = 0.25;

let worker: Worker | null = null;
let serial = 0;
const waiting = new Map<number, (result: NotationResult) => void>();

function render(xml: string, interval: string, scale: number): Promise<NotationResult> {
  if (!worker) {
    worker = new Worker(new URL('./notation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<NotationResult>) => {
      const done = waiting.get(event.data.id);
      waiting.delete(event.data.id);
      done?.(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      console.warn('dewidebug notation worker crashed', {
        message: event.message,
        waiting: waiting.size,
      });
      for (const [id, done] of waiting)
        done({
          id,
          svg: '',
          measures: [],
          notes: [],
          ms: 0,
          error: event.message || 'the notation engine failed to load',
        });
      waiting.clear();
      worker = null;
    };
  }
  serial += 1;
  const request: NotationRequest = { id: serial, xml, interval, scale };
  const target = worker;
  return new Promise((resolve) => {
    waiting.set(request.id, resolve);
    target.postMessage(request);
  });
}

export interface NotationMarks {
  history: History;
  dispatch: (action: HistoryAction) => void;
  tools: ToolState;
  selected: string | null;
  onSelect: (id: string | null) => void;
  editable: boolean;
}

interface Boxes {
  key: string;
  staffTop: number;
  height: number;
  bars: { page: number; left: number; width: number }[];
}

function measureBars(box: HTMLElement, result: NotationResult, key: string): Boxes {
  const origin = box.getBoundingClientRect();
  const bars: Boxes['bars'] = [];
  result.measures.forEach((m, index) => {
    const el = box.querySelector(`#${CSS.escape(m.id)}`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const content = el.querySelector('g.note, g.rest, g.mRest, g.chord');
    const contentLeft = content ? content.getBoundingClientRect().left : r.right;
    let start = r.left;
    for (const sign of Array.from(el.querySelectorAll('g.clef, g.keySig, g.meterSig'))) {
      const b = sign.getBoundingClientRect();
      if (b.right <= contentLeft + 0.5) start = Math.max(start, b.right);
    }
    bars.push({ page: index + 1, left: start - origin.left, width: r.right - start });
  });
  const line = box.querySelector('g.staff > path');
  const staffTop = line ? line.getBoundingClientRect().top - origin.top : 0;
  console.info('dewidebug notation bars measured', {
    bars: bars.length,
    staffTop: Math.round(staffTop),
    height: Math.round(origin.height),
  });
  return { key, staffTop, height: origin.height, bars };
}

export function scoreQuarter(
  perf: Performance,
  measures: readonly ScoreMeasure[],
  starts: readonly number[],
  position: number,
): { measure: number; q: number } | null {
  const bar = perf.bars[barAt(perf, position)];
  if (!bar) return null;
  const measure = measures[bar.measure];
  const start = starts[bar.measure];
  if (!measure || start === undefined) return null;
  const span = Math.max(1e-6, bar.end - bar.start);
  const f = Math.min(1, Math.max(0, (position - bar.start) / span));
  return { measure: bar.measure, q: start + (f * measure.ticks) / TPQ };
}

export function Notation({
  xml,
  transpose,
  perf,
  measures,
  playing,
  position,
  onSeek,
  zoom,
  onZoom,
  drawing,
  marks,
}: {
  xml: string;
  transpose: number;
  perf: Performance;
  measures: readonly ScoreMeasure[];
  playing: boolean;
  position: () => number;
  onSeek: (seconds: number) => void;
  zoom: number;
  onZoom: Dispatch<SetStateAction<number>>;
  drawing: boolean;
  marks: NotationMarks;
}) {
  const [result, setResult] = useState<{
    key: string;
    scale: number;
    value: NotationResult;
  } | null>(null);
  const interval = intervalFor(perf.keyFifths, transpose);
  const key = `${interval}:${String(xml.length)}:${xml.slice(0, 64)}`;
  const scale = Math.round(BASE_SCALE * zoom);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const current = result?.key === key ? result.value : null;
  const shownScale = result?.key === key ? result.scale : scale;
  const k = shownScale / 100;
  const [boxes, setBoxes] = useState<Boxes | null>(null);
  const textEditing = useTextEditing(marks.dispatch, marks.tools, MARK_SIZE);
  useWheelZoom(scrollEl, onZoom, 'notation');

  useEffect(() => {
    let cancelled = false;
    render(xml, interval, scale).then(
      (value) => {
        if (cancelled) return;
        console.info('dewidebug notation rendered', {
          ms: value.ms,
          scale,
          measures: value.measures.length,
          ours: measures.length,
          notes: value.notes.length,
          error: value.error,
        });
        setResult({ key, scale, value });
      },
      (error: unknown) => {
        console.warn('dewidebug notation worker failed', { error: String(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [xml, interval, key, scale, measures.length]);

  useEffect(() => {
    const box = holder.current;
    if (!current || !box) return;
    const measure = () => {
      setBoxes(measureBars(box, current, `${key}@${String(shownScale)}`));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [current, key, shownScale]);
  const bars = boxes?.key === `${key}@${String(shownScale)}` ? boxes : null;
  const barsAgree = current?.measures.length === measures.length;

  const starts = useMemo(() => {
    if (!current) return [];
    if (current.measures.length === measures.length) return current.measures.map((m) => m.q);
    console.warn('dewidebug notation bar counts differ; following by score position', {
      verovio: current.measures.length,
      ours: measures.length,
    });
    return measures.map((m) => m.tick / TPQ);
  }, [current, measures]);

  const longest = useMemo(
    () => (current ? Math.max(0, ...current.notes.map((n) => n.off - n.on)) : 0),
    [current],
  );

  useEffect(() => {
    const box = holder.current;
    const view = scroller.current;
    if (!current || !box || !view) return;
    let frame = 0;
    let lit: Element[] = [];
    let shownMeasure = -1;
    const paint = () => {
      const at = scoreQuarter(perf, measures, starts, position());
      for (const el of lit) el.classList.remove('pa-playing');
      lit = [];
      if (at) {
        for (const id of soundingIds(current.notes, at.q, longest)) {
          const el = box.querySelector(`#${CSS.escape(id)}`);
          if (el) {
            el.classList.add('pa-playing');
            lit.push(el);
          }
        }
        if (at.measure !== shownMeasure) {
          shownMeasure = at.measure;
          const id = current.measures[at.measure]?.id;
          const el = id ? box.querySelector(`#${CSS.escape(id)}`) : null;
          if (el) {
            const left =
              el.getBoundingClientRect().left - view.getBoundingClientRect().left + view.scrollLeft;
            view.scrollTo({
              left: Math.max(0, left - view.clientWidth * SCROLL_LEAD),
              behavior: playing ? 'smooth' : 'auto',
            });
          }
        }
      }
      if (playing) frame = requestAnimationFrame(paint);
    };
    paint();
    return () => {
      cancelAnimationFrame(frame);
      for (const el of lit) el.classList.remove('pa-playing');
    };
  }, [current, perf, measures, starts, longest, playing, position]);

  if (current?.error) {
    return (
      <div className="notation notation-message" data-testid="notation-error">
        {strings.notation.drawFailed} {current.error}
      </div>
    );
  }

  return (
    <div className={`notation-frame${drawing ? ' is-drawing' : ''}`}>
      {!drawing && (
        <span className="notation-zoom" title={tips.notation.zoom}>
          <ZoomControl zoom={zoom} onZoom={onZoom} testId="notation-zoom-level" />
        </span>
      )}
      {current && !barsAgree && drawing && (
        <p className="muted small-print notation-note">{strings.notation.barsDiffer}</p>
      )}
      <div
        className="notation"
        ref={(el) => {
          scroller.current = el;
          setScrollEl(el);
        }}
        data-testid="notation"
        data-scale={shownScale}
      >
        {!current && <p className="muted notation-message">{strings.notation.drawing}</p>}
        {current && (
          <div className="notation-canvas">
            <div
              ref={holder}
              className="notation-svg"
              data-testid="notation-svg"
              onClick={(e) => {
                const target = e.target instanceof Element ? e.target.closest('g.measure') : null;
                const index = target ? current.measures.findIndex((m) => m.id === target.id) : -1;
                if (index < 0) return;
                const now = position();
                const bars = perf.bars.filter((b) => b.measure === index);
                const bar = bars.find((b) => b.start >= now - 0.01) ?? bars[0];
                console.info('dewidebug notation bar clicked', { index, to: bar?.start ?? null });
                if (bar) onSeek(bar.start);
              }}
              dangerouslySetInnerHTML={{ __html: current.svg }}
            />
            {bars && barsAgree && (
              <div
                className={`notation-marks${drawing && marks.editable ? ' is-editable' : ''}`}
                data-testid="notation-marks"
              >
                {bars.bars.map((b) => (
                  <div
                    key={b.page}
                    className="notation-bar"
                    style={{ left: b.left, width: b.width, height: bars.height }}
                  >
                    <AnnotationLayer
                      page={b.page}
                      width={b.width / k}
                      height={bars.height / k}
                      originY={-bars.staffTop / k}
                      scale={k}
                      items={itemsOn(marks.history.present, b.page)}
                      tools={marks.tools}
                      dispatch={marks.dispatch}
                      selected={marks.selected}
                      onSelect={marks.onSelect}
                      onEditText={textEditing.start}
                      readOnly={!(drawing && marks.editable)}
                      sizeScale={MARK_SIZE}
                      testId="notation-layer"
                      className="notation-layer"
                    />
                    {textEditing.editor(
                      b.page,
                      (x, y) => ({ left: x * k, top: bars.staffTop + y * k }),
                      k,
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
