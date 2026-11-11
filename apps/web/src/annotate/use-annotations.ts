import {
  diffAnnotations,
  emptyAnnotations,
  isNoChange,
  type Annotations,
  type PageTurns,
  type QuarterTurn,
} from '@pcaa/shared';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { api, type AnnotationLayer } from '../api/client.ts';
import { historyReducer, initialHistory, type HistoryAction } from './history.ts';

const SAVE_DEBOUNCE_MS = 800;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

export type LoadState = 'loading' | 'ready' | 'error';

export function useAnnotations(pieceId: string, file: string, layer: AnnotationLayer = 'notation') {
  const [history, dispatch] = useReducer(historyReducer, emptyAnnotations(), initialHistory);
  const key = `${pieceId}/${file}/${layer}`;
  const [loadNonce, setLoadNonce] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; error: string | null } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [turns, setTurns] = useState<PageTurns>({});
  const confirmed = useRef<Annotations | null>(null);
  const inFlight = useRef<Annotations | null>(null);
  const waiting = useRef(false);
  const failures = useRef(0);
  const latest = useRef<Annotations>(history.present);
  useLayoutEffect(() => {
    latest.current = history.present;
  }, [history.present]);

  useEffect(() => {
    let cancelled = false;
    confirmed.current = null;
    api.getAnnotations(pieceId, file, layer).then(
      (doc) => {
        if (cancelled) return;
        confirmed.current = doc;
        failures.current = 0;
        dispatch({ type: 'reset', doc });
        setTurns(doc.turns ?? {});
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
  }, [pieceId, file, layer, key, loadNonce]);

  const load: LoadState = loaded?.key !== key ? 'loading' : loaded.error ? 'error' : 'ready';
  const loadError = loaded?.key === key ? loaded.error : null;

  const saveNow = useCallback(
    (keepalive: boolean) => {
      const doc = latest.current;
      const sending = inFlight.current;
      if (confirmed.current === null) return;
      if (sending !== null && !keepalive) {
        if (doc !== sending) {
          waiting.current = true;
          console.info('dewidebug annotations save waits for the one in flight', {
            pieceId,
            file,
            layer,
          });
        }
        return;
      }
      const base = sending ?? confirmed.current;
      if (doc === base) return;
      const changes = diffAnnotations(base, doc);
      if (isNoChange(changes)) {
        console.info('dewidebug annotations unchanged since the last save; nothing sent', {
          pieceId,
          file,
          layer,
        });
        if (sending === null) confirmed.current = doc;
        return;
      }
      console.info('dewidebug annotations saving changes', {
        pieceId,
        file,
        layer,
        put: Object.values(changes.put).reduce((n, items) => n + items.length, 0),
        remove: changes.remove.length,
        keepalive,
      });
      inFlight.current = doc;
      api.changeAnnotations(pieceId, file, changes, keepalive, layer).then(
        () => {
          if (inFlight.current === doc) inFlight.current = null;
          confirmed.current = doc;
          if (failures.current > 0)
            console.info('dewidebug annotations save recovered', { pieceId, file, layer });
          failures.current = 0;
          setSaveError(null);
          if (waiting.current) {
            waiting.current = false;
            setRetryNonce((n) => n + 1);
          }
        },
        (e: unknown) => {
          if (inFlight.current === doc) inFlight.current = null;
          waiting.current = false;
          const delay =
            RETRY_DELAYS_MS[Math.min(failures.current, RETRY_DELAYS_MS.length - 1)] ?? 30_000;
          failures.current += 1;
          console.warn('dewidebug annotations save failed; will retry', {
            pieceId,
            file,
            layer,
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
    [pieceId, file, layer],
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

  const turnPage = useCallback(
    (page: number) => {
      const key = String(page);
      const before = turns;
      const turn = (((before[key] ?? 0) + 90) % 360) as QuarterTurn;
      console.info('dewidebug score page turn', {
        pieceId,
        file,
        page,
        from: before[key] ?? 0,
        to: turn,
      });
      setTurns({ ...before, [key]: turn });
      api.turnPage(pieceId, file, page, turn).then(
        (saved) => {
          setTurns(saved.turns ?? {});
          setSaveError(null);
        },
        (e: unknown) => {
          console.warn('dewidebug score page turn failed; turning it back', {
            pieceId,
            file,
            page,
            error: String(e),
          });
          setTurns(before);
          setSaveError(e instanceof Error ? e.message : String(e));
        },
      );
    },
    [turns, pieceId, file],
  );

  return {
    history,
    dispatch: act,
    load,
    error: loadError ?? saveError,
    reload,
    adopt,
    turns,
    turnPage,
  };
}
