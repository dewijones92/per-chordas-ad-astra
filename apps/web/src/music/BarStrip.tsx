import { useEffect, useRef, useState } from 'react';
import type { PerfBar } from './performance.ts';

export const CELL_WIDTH = 22;
const HEIGHT = 30;

export interface BarRange {
  from: number;
  to: number;
}

export function rangeBetween(a: number, b: number): BarRange {
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

export function isJumpBack(bars: readonly PerfBar[], index: number): boolean {
  const bar = bars[index];
  const previous = bars[index - 1];
  return bar !== undefined && previous !== undefined && bar.measure !== previous.measure + 1;
}

export function BarStrip({
  bars,
  current,
  loop,
  loopOff = false,
  onSeek,
  onLoop,
}: {
  bars: readonly PerfBar[];
  current: number;
  loop: BarRange | null;
  loopOff?: boolean;
  onSeek: (index: number) => void;
  onLoop: (range: BarRange) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ anchor: number; to: number; moved: boolean } | null>(null);
  const width = bars.length * CELL_WIDTH;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.max(1, Math.floor(width * ratio));
    el.height = Math.floor(HEIGHT * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);
    const shown = drag?.moved ? rangeBetween(drag.anchor, drag.to) : loop;
    ctx.font = '700 10px Nunito Variable, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    bars.forEach((bar, i) => {
      const x = i * CELL_WIDTH;
      const inLoop = shown !== null && i >= shown.from && i <= shown.to;
      ctx.fillStyle =
        i === current
          ? '#6d3df2'
          : inLoop
            ? loopOff && !drag?.moved
              ? '#fff1c7'
              : '#ffc53d'
            : i % 2 === 0
              ? '#ffffff'
              : '#f6f3ff';
      ctx.fillRect(x, 0, CELL_WIDTH, HEIGHT);
      if (isJumpBack(bars, i)) {
        ctx.fillStyle = '#ff5d73';
        ctx.fillRect(x, 0, 3, HEIGHT);
      }
      ctx.fillStyle = i === current ? '#ffffff' : '#1d1533';
      ctx.fillText(String(bar.number), x + CELL_WIDTH / 2, HEIGHT / 2 + 1);
    });
    ctx.strokeStyle = '#1d1533';
    ctx.lineWidth = 2;
    if (shown) {
      ctx.strokeRect(
        shown.from * CELL_WIDTH + 1,
        1,
        (shown.to - shown.from + 1) * CELL_WIDTH - 2,
        HEIGHT - 2,
      );
    }
  }, [bars, current, loop, loopOff, drag, width]);

  useEffect(() => {
    const box = scroller.current;
    if (!box || drag) return;
    const x = current * CELL_WIDTH;
    if (
      x < box.scrollLeft + CELL_WIDTH * 2 ||
      x > box.scrollLeft + box.clientWidth - CELL_WIDTH * 3
    ) {
      box.scrollLeft = Math.max(0, x - box.clientWidth / 3);
    }
  }, [current, drag]);

  const indexAt = (clientX: number): number => {
    const rect = canvas.current?.getBoundingClientRect();
    const x = clientX - (rect?.left ?? 0);
    return Math.min(bars.length - 1, Math.max(0, Math.floor(x / CELL_WIDTH)));
  };

  return (
    <div className="barstrip" ref={scroller}>
      <canvas
        ref={canvas}
        className="barstrip-canvas"
        data-testid="playalong-bars"
        data-cell-width={CELL_WIDTH}
        aria-label="Bars: click to jump, drag across bars to loop them"
        style={{ width: `${String(width)}px`, height: `${String(HEIGHT)}px` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const at = indexAt(e.clientX);
          if (e.shiftKey && loop) {
            onLoop(rangeBetween(at < loop.from ? at : loop.from, at > loop.to ? at : loop.to));
            return;
          }
          setDrag({ anchor: at, to: at, moved: false });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const at = indexAt(e.clientX);
          if (at !== drag.to) setDrag({ ...drag, to: at, moved: true });
        }}
        onPointerUp={(e) => {
          if (!drag) return;
          const at = indexAt(e.clientX);
          setDrag(null);
          if (drag.moved || at !== drag.anchor) onLoop(rangeBetween(drag.anchor, at));
          else onSeek(at);
        }}
        onPointerCancel={() => {
          setDrag(null);
        }}
      />
    </div>
  );
}
