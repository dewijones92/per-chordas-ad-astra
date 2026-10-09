export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 0.1;

const WHEEL_SENSITIVITY = 0.001;
const MAX_WHEEL_PIXELS = 100;
const LINE_PIXELS = 16;
const PAGE_PIXELS = 800;

export type ZoomKey = 'in' | 'out' | 'reset';

export interface ZoomKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(Math.round((zoom + direction * ZOOM_STEP) * 10) / 10);
}

export function wheelZoom(zoom: number, deltaY: number, deltaMode: number): number {
  const scale = deltaMode === 1 ? LINE_PIXELS : deltaMode === 2 ? PAGE_PIXELS : 1;
  const pixels = Math.max(-MAX_WHEEL_PIXELS, Math.min(MAX_WHEEL_PIXELS, deltaY * scale));
  return clampZoom(zoom * Math.exp(-pixels * WHEEL_SENSITIVITY));
}

export function zoomKeyOf(e: ZoomKeyEvent): ZoomKey | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  switch (e.key) {
    case '=':
    case '+':
      return 'in';
    case '-':
    case '_':
      return 'out';
    case '0':
      return 'reset';
    default:
      return null;
  }
}
