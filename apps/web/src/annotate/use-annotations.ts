import { emptyAnnotations, type Annotations } from '@pcaa/shared';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { historyReducer, initialHistory, type HistoryAction } from './history.ts';

const SAVE_DEBOUNCE_MS = 800;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

export type LoadState = 'loading' | 'ready' | 'error';

export function useAnnotations(pieceId: string, file: string) {
  const [history, dispatch] = useReducer(historyReducer, emptyAnnotations(), initialHistory);
  const key = `${pieceId}/${file}`;
  const [loadNonce, setLoadNonce] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; error: string | null } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const confirmed = useRef<Annotations | null>(null);
  const inFlight = useRef<Annotations | null>(null);
  const failures = useRef(0);
  const latest = useRef<Annotations>(history.present);
  useLayoutEffect(() => {
    latest.current = history.present;
  }, [history.present]);

  useEffect(() => {
    let cancelled = false;
    confirmed.current = null;
    api.getAnnotations(pieceId, file).then(
      (doc) => {
        if (cancelled) return;
        confirmed.current = doc;
        failures.current = 0;
        dispatch({ type: 'reset', doc });
        setLoaded({ key, error: null });
      },
      (e: unknown) => {
        if (cancelled) return;
        console.warn('dewidebug annotations load failed; drawing disabled until it loads', {
          key,
          error: String(e),
        });
        setLoaded({ key, error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pieceId, file, key, loadNonce]);

  const load: LoadState = loaded?.key !== key ? 'loading' : loaded.error ? 'error' : 'ready';
  const loadError = loaded?.key === key ? loaded.error : null;

  const saveNow = useCallback(
    (keepalive: boolean) => {
      const doc = latest.current;
      if (confirmed.current === null) return;
      if (doc === confirmed.current || doc === inFlight.current) return;
      inFlight.current = doc;
      api.putAnnotations(pieceId, file, doc, keepalive).then(
        () => {
          if (inFlight.current === doc) inFlight.current = null;
          confirmed.current = doc;
          if (failures.current > 0)
            console.info('dewidebug annotations save recovered', { pieceId, file });
          failures.current = 0;
          setSaveError(null);
        },
        (e: unknown) => {
          if (inFlight.current === doc) inFlight.current = null;
          const delay =
            RETRY_DELAYS_MS[Math.min(failures.current, RETRY_DELAYS_MS.length - 1)] ?? 30_000;
          failures.current += 1;
          console.warn('dewidebug annotations save failed; will retry', {
            pieceId,
            file,
            attempt: failures.current,
            delay,
            error: String(e),
          });
          setSaveError(`${e instanceof Error ? e.message : String(e)} (retrying)`);
          window.setTimeout(() => {
            setRetryNonce((n) => n + 1);
          }, delay);
        },
      );
    },
    [pieceId, file],
  );

  useEffect(() => {
    if (load !== 'ready' || confirmed.current === history.present) return;
    const timer = window.setTimeout(() => {
      saveNow(false);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [history.present, load, saveNow, retryNonce]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        saveNow(true);
        void api.flush('page-hidden', true).catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      saveNow(true);
    };
  }, [saveNow]);

  const act = useCallback((action: HistoryAction) => {
    dispatch(action);
  }, []);
  const reload = useCallback(() => {
    setLoadNonce((n) => n + 1);
  }, []);
  const adopt = useCallback((saved: Annotations) => {
    if (!saved.pdfImport) return;
    const before = new Set(
      Object.values(confirmed.current?.pages ?? {}).flatMap((items) => items.map((i) => i.id)),
    );
    const pages = Object.fromEntries(
      Object.entries(saved.pages)
        .map(([page, items]) => [page, items.filter((i) => !before.has(i.id))] as const)
        .filter(([, items]) => items.length > 0),
    );
    console.info('dewidebug annotations adopted an import', {
      added: Object.values(pages).reduce((n, items) => n + items.length, 0),
      localEditsPending: latest.current !== confirmed.current,
    });
    confirmed.current = saved;
    dispatch({ type: 'import', pages, pdfImport: saved.pdfImport });
  }, []);

  return { history, dispatch: act, load, error: loadError ?? saveError, reload, adopt };
}
