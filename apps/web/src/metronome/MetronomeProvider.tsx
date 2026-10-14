import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MetronomeSettings as SettingsSchema, type MetronomeSave } from '@pcaa/shared';
import { api } from '../api/client.ts';
import { MetronomeEngine } from './engine.ts';
import { clampBpm, type MetronomeSettings, type Tick } from './scheduler.ts';
import { loadSettings, reconcile, saveSettings, type StampedSettings } from './settings-store.ts';
import { tapTempo } from './tap-tempo.ts';

export interface MetronomeApi {
  settings: MetronomeSettings;
  update: (patch: Partial<MetronomeSettings>) => void;
  setBpm: (bpm: number) => void;
  running: boolean;
  toggle: () => void;
  tap: () => void;
  tick: Tick | null;
  played: number;
}

const MetronomeContext = createContext<MetronomeApi | null>(null);

const PUSH_DEBOUNCE_MS = 1500;

type Origin = 'load' | 'user' | 'server';
interface Held extends StampedSettings {
  origin: Origin;
}

export function MetronomeProvider({ children }: { children: ReactNode }) {
  const engine = useRef<MetronomeEngine | null>(null);
  const taps = useRef<number[]>([]);
  const [held, setHeld] = useState<Held>(() => ({ ...loadSettings(), origin: 'load' }));
  const settings = held.settings;
  const latest = useRef<Held>(held);
  const unsent = useRef<MetronomeSave | null>(null);
  const pushTimer = useRef<number | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState<Tick | null>(null);
  const [played, setPlayed] = useState(0);

  const getEngine = () => (engine.current ??= new MetronomeEngine());

  const push = useCallback((save: MetronomeSave, keepalive: boolean) => {
    if (!SettingsSchema.safeParse(save.settings).success) {
      console.warn('dewidebug metronome settings out of range; kept in this browser only', save);
      return;
    }
    unsent.current = null;
    api.putMetronome(save, keepalive).then(
      (stored) => {
        const storedAt = stored ? Date.parse(stored.updatedAt) : -1;
        console.info('dewidebug metronome settings pushed', { at: save.at, storedAt });
        if (stored && storedAt > latest.current.at) {
          setHeld({ settings: stored.metronome, at: storedAt, origin: 'server' });
        }
      },
      (error: unknown) => {
        unsent.current ??= save;
        console.warn('dewidebug metronome settings push failed; kept locally', {
          error: String(error),
        });
      },
    );
  }, []);

  useEffect(() => {
    latest.current = held;
    saveSettings({ settings: held.settings, at: held.at });
    if (engine.current?.running) engine.current.retune(held.settings);
    if (held.origin !== 'user') return;
    unsent.current = { settings: held.settings, at: held.at };
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      if (unsent.current) push(unsent.current, false);
    }, PUSH_DEBOUNCE_MS);
  }, [held, push]);

  useEffect(() => {
    let cancelled = false;
    api.getSettings().then(
      (remote) => {
        if (cancelled) return;
        const decision = reconcile(latest.current, remote, Date.now());
        console.info('dewidebug metronome settings reconciled with the data repo', {
          decision: decision.kind,
          localAt: latest.current.at,
          remoteAt: remote?.updatedAt ?? null,
          ...(decision.kind === 'none' ? { why: decision.why } : {}),
        });
        if (decision.kind === 'adopt') setHeld({ ...decision.stamped, origin: 'server' });
        if (decision.kind === 'push') push(decision.save, false);
      },
      (error: unknown) => {
        console.warn('dewidebug metronome settings fetch failed; using this browser’s copy', {
          error: String(error),
        });
      },
    );
    const onHide = () => {
      window.clearTimeout(pushTimer.current);
      if (unsent.current) push(unsent.current, true);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onHide);
    };
  }, [push]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last: Tick | null = null;
    const loop = () => {
      const current = engine.current?.currentTick() ?? null;
      if (current && current !== last) {
        last = current;
        setTick(current);
        setPlayed(engine.current?.playedCount ?? 0);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [running]);

  useEffect(
    () => () => {
      engine.current?.stop();
    },
    [],
  );

  const update = useCallback((patch: Partial<MetronomeSettings>) => {
    setHeld((h) => ({
      settings: { ...h.settings, ...patch, bpm: clampBpm(patch.bpm ?? h.settings.bpm) },
      at: Math.max(Date.now(), h.at + 1),
      origin: 'user',
    }));
  }, []);
  const setBpm = useCallback(
    (bpm: number) => {
      update({ bpm });
    },
    [update],
  );

  const toggle = useCallback(() => {
    const e = getEngine();
    if (e.running) {
      e.stop();
      setRunning(false);
      setTick(null);
      return;
    }
    e.start(settings).then(
      () => {
        setRunning(true);
      },
      (error: unknown) => {
        console.error('dewidebug metronome could not start audio', error);
      },
    );
  }, [settings]);

  const tap = useCallback(() => {
    const result = tapTempo(taps.current, performance.now());
    taps.current = result.taps;
    if (result.bpm !== null) setBpm(result.bpm);
  }, [setBpm]);

  const value = useMemo<MetronomeApi>(
    () => ({ settings, update, setBpm, running, toggle, tap, tick, played }),
    [settings, update, setBpm, running, toggle, tap, tick, played],
  );
  return <MetronomeContext value={value}>{children}</MetronomeContext>;
}

export function useMetronome(): MetronomeApi {
  const api = useContext(MetronomeContext);
  if (!api) throw new Error('useMetronome must be used inside MetronomeProvider');
  return api;
}
