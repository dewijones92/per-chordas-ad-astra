import { useRef } from 'react';

const MIN_HEIGHT = 40;
const KEY_STEP = 24;
const ROOM_BELOW = 200;

interface Bounds {
  from: number;
  max: number;
}

function boundsOf(handle: HTMLElement): Bounds {
  const above = handle.previousElementSibling;
  const box = handle.parentElement;
  return {
    from: above?.getBoundingClientRect().height ?? 0,
    max: Math.max(MIN_HEIGHT, (box?.getBoundingClientRect().height ?? 0) - ROOM_BELOW),
  };
}

const clamp = (height: number, max: number) =>
  Math.round(Math.min(max, Math.max(MIN_HEIGHT, height)));

export function ResizeHandle({
  label,
  testId,
  onDrag,
  onDone,
}: {
  label: string;
  testId: string;
  onDrag: (height: number) => void;
  onDone: (height: number | null) => void;
}) {
  const drag = useRef<{ y: number; from: number; to: number; max: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      title={label}
      tabIndex={0}
      className="playalong-resize"
      data-testid={testId}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const b = boundsOf(e.currentTarget);
        drag.current = { y: e.clientY, from: b.from, to: b.from, max: b.max };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.to = clamp(d.from + e.clientY - d.y, d.max);
        onDrag(d.to);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        console.info('dewidebug resize by drag', { testId, from: d.from, to: d.to, max: d.max });
        onDone(d.to);
      }}
      onDoubleClick={() => {
        console.info('dewidebug resize back to automatic', { testId });
        onDone(null);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const b = boundsOf(e.currentTarget);
        const to = clamp(b.from + (e.key === 'ArrowDown' ? KEY_STEP : -KEY_STEP), b.max);
        console.info('dewidebug resize by key', { testId, key: e.key, from: b.from, to });
        onDone(to);
      }}
    />
  );
}
