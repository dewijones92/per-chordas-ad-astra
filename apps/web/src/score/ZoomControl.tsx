import { stepZoom } from './zoom.ts';
import { tips } from '../strings.ts';

export function ZoomControl({
  zoom,
  onZoom,
  testId = 'zoom-level',
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  testId?: string;
}) {
  return (
    <>
      <button
        type="button"
        className="btn small icon"
        aria-label={tips.zoom.out}
        onClick={() => {
          onZoom(stepZoom(zoom, -1));
        }}
      >
        −
      </button>
      <span className="muted zoom-label" data-testid={testId}>
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        className="btn small icon"
        aria-label={tips.zoom.in}
        onClick={() => {
          onZoom(stepZoom(zoom, 1));
        }}
      >
        +
      </button>
    </>
  );
}
