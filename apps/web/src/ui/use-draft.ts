import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

export function useDraft<T>(
  value: T,
  save: (value: T, keepalive: boolean) => void,
  delayMs = 900,
): readonly [T, (next: T) => void] {
  const [draft, setDraft] = useState(value);
  const latest = useRef(draft);
  const pending = useRef(false);
  useLayoutEffect(() => {
    latest.current = draft;
  }, [draft]);

  const flush = useEffectEvent((keepalive: boolean) => {
    if (!pending.current) return;
    pending.current = false;
    save(latest.current, keepalive);
  });

  useEffect(() => {
    if (!pending.current) return;
    const timer = window.setTimeout(() => {
      flush(false);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, delayMs]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const onPageHide = () => {
      flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush(true);
    };
  }, []);

  const change = (next: T) => {
    pending.current = true;
    setDraft(next);
  };
  return [draft, change] as const;
}
