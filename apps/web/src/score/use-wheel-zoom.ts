import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { wheelZoom } from './zoom.ts';

export function useWheelZoom(
  target: HTMLElement | Window | null,
  setZoom: Dispatch<SetStateAction<number>>,
  label: string,
): void {
  useEffect(() => {
    if (!target) return;
    let gesture: { events: number; from: number; to: number } | null = null;
    let quiet = 0;
    const onWheel = (event: Event) => {
      if (!(event instanceof WheelEvent) || !event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      setZoom((from) => {
        const to = wheelZoom(from, event.deltaY, event.deltaMode);
        gesture = gesture
          ? { ...gesture, events: gesture.events + 1, to }
          : { events: 1, from, to };
        return to;
      });
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => {
        console.info(`dewidebug ${label} zoom by ctrl+wheel or pinch`, gesture);
        gesture = null;
      }, 400);
    };
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.clearTimeout(quiet);
      target.removeEventListener('wheel', onWheel);
    };
  }, [target, setZoom, label]);
}
