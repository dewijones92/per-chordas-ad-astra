import { stepZoom } from './zoom.ts';
import { tips } from '../strings.ts';

export function ZoomControl({
  zoom,
  onZoom,
  testId = 'zoom-level',
  step = stepZoom,
  format,
  less = tips.zoom.out,
  more = tips.zoom.in,
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  testId?: string;
  step?: (value: number, direction: 1 | -1) => number;
  format?: (value: number) => string;
  less?: string;
  more?: string;
}) {
  return (
    <>
      <button
        type="button"
        className="btn small icon"
        aria-label={less}
        onClick={() => {
          onZoom(step(zoom, -1));
        }}
      >
        −
      </button>
      <span className="muted zoom-label" data-testid={testId}>
        {format ? format(zoom) : `${String(Math.round(zoom * 100))}%`}
      </span>
      <button
        type="button"
        className="btn small icon"
        aria-label={more}
        onClick={() => {
          onZoom(step(zoom, 1));
        }}
      >
        +
      </button>
    </>
  );
}
