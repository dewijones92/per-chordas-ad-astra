import { useEffect, useMemo, useRef, useState } from 'react';
import { intervalFor } from './keys.ts';
import { TPQ, type ScoreMeasure } from './model.ts';
import { soundingIds, type NotationRequest, type NotationResult } from './notation-protocol.ts';
import { barAt, type Performance } from './performance.ts';

const SCALE = 38;
const SCROLL_LEAD = 0.25;

let worker: Worker | null = null;
let serial = 0;
const waiting = new Map<number, (result: NotationResult) => void>();

function render(xml: string, interval: string): Promise<NotationResult> {
  if (!worker) {
    worker = new Worker(new URL('./notation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<NotationResult>) => {
      const done = waiting.get(event.data.id);
      waiting.delete(event.data.id);
      done?.(event.data);
    };
  }
  serial += 1;
  const request: NotationRequest = { id: serial, xml, interval, scale: SCALE };
  const target = worker;
  return new Promise((resolve) => {
    waiting.set(request.id, resolve);
    target.postMessage(request);
  });
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
}: {
  xml: string;
  transpose: number;
  perf: Performance;
  measures: readonly ScoreMeasure[];
  playing: boolean;
  position: () => number;
  onSeek: (seconds: number) => void;
}) {
  const [result, setResult] = useState<{ key: string; value: NotationResult } | null>(null);
  const interval = intervalFor(perf.keyFifths, transpose);
  const key = `${interval}:${String(xml.length)}:${xml.slice(0, 64)}`;
  const scroller = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const current = result?.key === key ? result.value : null;

  useEffect(() => {
    let cancelled = false;
    render(xml, interval).then(
      (value) => {
        if (cancelled) return;
        console.info('dewidebug notation rendered', {
          ms: value.ms,
          measures: value.measures.length,
          ours: measures.length,
          notes: value.notes.length,
          error: value.error,
        });
        setResult({ key, value });
      },
      (error: unknown) => {
        console.warn('dewidebug notation worker failed', { error: String(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [xml, interval, key, measures.length]);

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
        Could not draw the notation: {current.error}
      </div>
    );
  }

  return (
    <div className="notation" ref={scroller} data-testid="notation">
      {!current && <p className="muted notation-message">Drawing the notation…</p>}
      {current && (
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
      )}
    </div>
  );
}
