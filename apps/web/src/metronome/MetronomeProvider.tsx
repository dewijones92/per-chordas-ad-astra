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
import { MetronomeEngine } from './engine.ts';
import { clampBpm, type MetronomeSettings, type Tick } from './scheduler.ts';
import { loadSettings, saveSettings } from './settings-store.ts';
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

export function MetronomeProvider({ children }: { children: ReactNode }) {
  const engine = useRef<MetronomeEngine | null>(null);
  const taps = useRef<number[]>([]);
  const [settings, setSettings] = useState(loadSettings);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState<Tick | null>(null);
  const [played, setPlayed] = useState(0);

  const getEngine = () => (engine.current ??= new MetronomeEngine());

  useEffect(() => {
    saveSettings(settings);
    if (engine.current?.running) engine.current.retune(settings);
  }, [settings]);

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
    setSettings((s) => ({ ...s, ...patch, bpm: clampBpm(patch.bpm ?? s.bpm) }));
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
