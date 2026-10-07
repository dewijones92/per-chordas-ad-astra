import type { SyncStatus } from '@pcaa/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '../api/client.ts';
import { saves } from './saves.ts';

const FAST_MS = 2_000;
const SLOW_MS = 15_000;

export function useSaves() {
  return useSyncExternalStore(saves.subscribe, saves.getSnapshot);
}

export function useServerSync(): { status: SyncStatus | null; reachable: boolean } {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [reachable, setReachable] = useState(true);
  const local = useSaves();

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      let next: SyncStatus | null = null;
      try {
        next = await api.syncStatus();
        if (!cancelled) {
          setStatus(next);
          setReachable(true);
        }
      } catch {
        if (!cancelled) setReachable(false);
      }
      if (cancelled) return;
      const settled = next?.phase === 'clean';
      timer = window.setTimeout(() => void poll(), settled ? SLOW_MS : FAST_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [local.lastSettledAt]);

  return { status, reachable };
}
