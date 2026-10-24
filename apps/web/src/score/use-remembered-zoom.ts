import { useEffect, useRef, useState } from 'react';
import { rememberZoom, savedZoom } from '../resume/resume.ts';
import { clampZoom } from './zoom.ts';

export function useRememberedZoom(spot: string) {
  const [zoom, setZoom] = useState(() => clampZoom(savedZoom(spot) ?? 1));
  const recorded = useRef(zoom);
  useEffect(() => {
    if (zoom === recorded.current) return;
    recorded.current = zoom;
    rememberZoom(spot, zoom);
  }, [zoom, spot]);
  return [zoom, setZoom] as const;
}
