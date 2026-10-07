import { emptyAnnotations, type Annotations } from '@pcaa/shared';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { historyReducer, initialHistory, type HistoryAction } from './history.ts';

const SAVE_DEBOUNCE_MS = 800;

export type LoadState = 'loading' | 'ready' | 'error';

export function useAnnotations(pieceId: string, file: string) {
  const [history, dispatch] = useReducer(historyReducer, emptyAnnotations(), initialHistory);
  const key = `${pieceId}/${file}`;
  const [loaded, setLoaded] = useState<{ key: string; error: string | null } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saved = useRef<Annotations | null>(null);
  const latest = useRef<Annotations>(history.present);
  useLayoutEffect(() => {
    latest.current = history.present;
  }, [history.present]);

  useEffect(() => {
    let cancelled = false;
    saved.current = null;
    api.getAnnotations(pieceId, file).then(
      (doc) => {
        if (cancelled) return;
        saved.current = doc;
        dispatch({ type: 'reset', doc });
        setLoaded({ key, error: null });
      },
      (e: unknown) => {
        if (cancelled) return;
        setLoaded({ key, error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pieceId, file, key]);

  const load: LoadState = loaded?.key !== key ? 'loading' : loaded.error ? 'error' : 'ready';
  const error = (loaded?.key === key ? loaded.error : null) ?? saveError;

  const saveNow = useCallback(
    (keepalive: boolean) => {
      const doc = latest.current;
      if (saved.current === null || saved.current === doc) return;
      saved.current = doc;
      api.putAnnotations(pieceId, file, doc, keepalive).catch((e: unknown) => {
        saved.current = null;
        setSaveError(e instanceof Error ? e.message : String(e));
      });
    },
    [pieceId, file],
  );

  useEffect(() => {
    if (load !== 'ready' || saved.current === history.present) return;
    const timer = window.setTimeout(() => {
      saveNow(false);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [history.present, load, saveNow]);

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

  return { history, dispatch: act, load, error };
}
