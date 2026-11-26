import type { PlayMode } from '@pcaa/shared';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { drawingClaimed } from '../annotate/use-drawing.ts';
import { ComputerKeyInput } from './computer-key-input.ts';
import { DEFAULT_BASE } from './computer-keys.ts';
import type { Lanes } from './hands.ts';
import { ScreenKeyInput, type KeyEvent, type KeySource } from './key-input.ts';
import { MidiKeyInput, type MidiDevice, type MidiStatus } from './midi-input.ts';
import type { PerfNote, Performance } from './performance.ts';
import type { PianoPlayer, PlayGate } from './player.ts';
import {
  RhythmSession,
  rhythmTargets,
  type HitPop,
  type NoteGrade,
  type PopGrade,
  type RhythmStats,
} from './rhythm-session.ts';
import { playerLanes, WaitSession, waitTargets, type WaitStats } from './wait-for-me.ts';

const WAIT_REFRESH_MS = 500;

export interface WaitForMe {
  mode: PlayMode;
  midi: MidiStatus;
  ports: readonly MidiDevice[];
  sustained: boolean;
  base: number;
  waiting: boolean;
  expected: ReadonlySet<number>;
  played: ReadonlySet<number>;
  stats: WaitStats;
  rhythmStats: RhythmStats;
  noteHits: ReadonlyMap<PerfNote, NoteGrade>;
  lastGrade: PopGrade | null;
  finished: boolean;
  isMine: ((note: PerfNote) => boolean) | null;
  pressScreen: (pitch: number) => void;
  releaseScreen: (pitch: number) => void;
  jumpTo: (song: number) => void;
  beforePlay: () => void;
  reset: () => void;
  advanceRhythm: (position: number, nowMs: number) => void;
  activePops: (nowMs: number) => HitPop[];
}

const EMPTY_WAIT_STATS: WaitStats = { targets: 0, notes: 0, right: 0, wrong: 0, waitedMs: 0 };
const EMPTY_RHYTHM_STATS: RhythmStats = {
  notes: 0,
  perfect: 0,
  good: 0,
  missed: 0,
  wrong: 0,
  streak: 0,
  bestStreak: 0,
  accuracy: 0,
};
const NONE: ReadonlySet<number> = new Set();
const NO_HITS: ReadonlyMap<PerfNote, NoteGrade> = new Map();

export function useWaitForMe(options: {
  mode: PlayMode;
  midiSound: boolean;
  midiDevice: string | null;
  player: PianoPlayer | null;
  perf: Performance | undefined;
  lanes: Lanes | null;
  hiddenLanes: readonly number[];
  mutedLanes: readonly number[];
  transpose: number;
  loopStart: number | null;
  playing: boolean;
}): WaitForMe {
  const {
    mode,
    midiSound,
    midiDevice,
    player,
    perf,
    lanes,
    hiddenLanes,
    mutedLanes,
    transpose,
    loopStart,
    playing,
  } = options;
  const [waitSession] = useState(() => new WaitSession());
  const [rhythmSession] = useState(() => new RhythmSession());
  const waitVersion = useSyncExternalStore(waitSession.subscribe, waitSession.getVersion);
  const rhythmVersion = useSyncExternalStore(rhythmSession.subscribe, rhythmSession.getVersion);
  const [tick, setTick] = useState(0);
  const [midi, setMidi] = useState<MidiStatus>({ state: 'off' });
  const [ports, setPorts] = useState<readonly MidiDevice[]>([]);
  const [sustained, setSustained] = useState(false);
  const [base, setBase] = useState(DEFAULT_BASE);
  const [played, setPlayed] = useState<ReadonlySet<number>>(NONE);
  const screen = useMemo(() => new ScreenKeyInput(), []);
  const midiRef = useRef<MidiKeyInput | null>(null);
  const modeRef = useRef(mode);
  const loopStartRef = useRef(loopStart);
  const midiDeviceRef = useRef(midiDevice);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    loopStartRef.current = loopStart;
  }, [loopStart]);
  useEffect(() => {
    midiDeviceRef.current = midiDevice;
    midiRef.current?.setDevice(midiDevice);
  }, [midiDevice]);

  useEffect(() => {
    player?.setLiveSound(midiSound);
  }, [player, midiSound]);

  const waitView = useMemo(
    () => waitSession.view(waitVersion, tick),
    [waitSession, waitVersion, tick],
  );
  const rhythmView = useMemo(
    () => rhythmSession.view(rhythmVersion),
    [rhythmSession, rhythmVersion],
  );

  const active = mode !== 'off';
  const isMine = useMemo(() => {
    if (!active || !lanes) return null;
    const mine = playerLanes(
      lanes.lanes.map((l) => l.index),
      hiddenLanes,
      mutedLanes,
    );
    console.info('dewidebug play mode lanes', {
      mode,
      mine: [...mine],
      hidden: hiddenLanes,
      muted: mutedLanes,
    });
    return (n: PerfNote) => mine.has(lanes.laneOf(n));
  }, [active, mode, lanes, hiddenLanes, mutedLanes]);

  const wTargets = useMemo(
    () => (mode === 'wait' && perf && isMine ? waitTargets(perf.notes, isMine, transpose) : []),
    [mode, perf, isMine, transpose],
  );
  const rTargets = useMemo(
    () => (mode === 'rhythm' && perf && isMine ? rhythmTargets(perf.notes, isMine, transpose) : []),
    [mode, perf, isMine, transpose],
  );

  useEffect(() => {
    if (!player || mode === 'off') return;
    if (mode === 'wait') {
      const gate: PlayGate = {
        limit: () => waitSession.limit(),
        wrapped: () => {
          waitSession.jumpTo(loopStartRef.current ?? 0, performance.now());
        },
        held: () => {
          waitSession.arrive(performance.now());
        },
        ended: () => {
          waitSession.finish(performance.now());
        },
      };
      player.setGate(gate);
      return () => {
        player.setGate(null);
        waitSession.suspend(performance.now());
      };
    }
    const gate: PlayGate = {
      limit: () => null,
      wrapped: () => {
        rhythmSession.jumpTo(loopStartRef.current ?? 0);
      },
      held: () => undefined,
      ended: () => {
        rhythmSession.finish(player.position(), player.speed, performance.now());
      },
    };
    player.setGate(gate);
    return () => {
      player.setGate(null);
    };
  }, [mode, player, waitSession, rhythmSession]);

  useEffect(() => {
    if (mode !== 'wait' || !player) return;
    waitSession.setTargets(wTargets, player.position(), performance.now());
    if (player.held) player.release();
  }, [mode, player, waitSession, wTargets]);

  useEffect(() => {
    if (mode !== 'rhythm' || !player) return;
    rhythmSession.setTargets(rTargets, player.position());
  }, [mode, player, rhythmSession, rTargets]);

  const onKeyRef = useRef<(e: KeyEvent) => void>(() => undefined);
  useEffect(() => {
    if (!player) return;
    const sources = new Map<number, Set<KeySource>>();
    const onKey = (e: KeyEvent) => {
      const held = sources.get(e.pitch) ?? new Set<KeySource>();
      if (e.kind === 'down') {
        held.add(e.source);
        sources.set(e.pitch, held);
        setPlayed(new Set(sources.keys()));
        player.keyDown(e.pitch, e.velocity);
        const currentMode = modeRef.current;
        if (currentMode === 'off') return;
        if (!player.judging) {
          console.info('dewidebug play mode key not judged: not playing', {
            mode: currentMode,
            pitch: e.pitch,
            source: e.source,
            active: player.active,
          });
          return;
        }
        if (currentMode === 'wait') {
          const outcome = waitSession.press(e.pitch, e.at, player.position());
          console.info('dewidebug wait-for-me key', {
            pitch: e.pitch,
            source: e.source,
            outcome: outcome.kind,
          });
          if (outcome.kind === 'correct' && outcome.done && player.held) player.release();
          return;
        }
        const grade = rhythmSession.press(e.pitch, player.position(), player.speed, e.at);
        console.info('dewidebug rhythm key', {
          pitch: e.pitch,
          source: e.source,
          grade,
        });
        return;
      }
      held.delete(e.source);
      if (held.size > 0) return;
      sources.delete(e.pitch);
      setPlayed(new Set(sources.keys()));
      if (modeRef.current === 'wait') waitSession.release(e.pitch);
      player.keyUp(e.pitch);
    };
    onKeyRef.current = onKey;
    const midiInput = new MidiKeyInput(setMidi, undefined, {
      onPorts: setPorts,
      onControl: (control) => {
        setSustained(control.down);
        player.setSustain(control.down);
      },
    });
    midiRef.current = midiInput;
    if (midiDeviceRef.current !== null) midiInput.setDevice(midiDeviceRef.current);
    midiInput.start(onKey);
    screen.start(onKey);
    return () => {
      midiInput.stop();
      midiRef.current = null;
      screen.stop();
      player.setSustain(false);
      setSustained(false);
      setPlayed(NONE);
    };
  }, [player, waitSession, rhythmSession, screen]);

  useEffect(() => {
    if (!active || !player) return;
    const computer = new ComputerKeyInput(setBase, drawingClaimed);
    computer.start((e) => {
      onKeyRef.current(e);
    });
    return () => {
      computer.stop();
    };
  }, [active, player]);

  useEffect(() => {
    if (mode !== 'wait') return;
    if (!playing) waitSession.suspend(performance.now());
  }, [mode, playing, waitSession]);

  const waiting = mode === 'wait' && waitView.waiting;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
    }, WAIT_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [waiting]);

  const jumpTo = useCallback(
    (song: number) => {
      if (modeRef.current === 'wait') waitSession.jumpTo(song, performance.now());
      else if (modeRef.current === 'rhythm') rhythmSession.jumpTo(song);
    },
    [waitSession, rhythmSession],
  );

  const beforePlay = useCallback(() => {
    if (!player) return;
    if (modeRef.current === 'wait') {
      if (waitSession.finished) waitSession.reset();
      waitSession.jumpTo(player.startPosition(), performance.now());
    } else if (modeRef.current === 'rhythm') {
      if (rhythmSession.view().finished) rhythmSession.reset();
      rhythmSession.jumpTo(player.startPosition());
    }
  }, [player, waitSession, rhythmSession]);

  const reset = useCallback(() => {
    waitSession.reset();
    rhythmSession.reset();
  }, [waitSession, rhythmSession]);

  const advanceRhythm = useCallback(
    (position: number, nowMs: number) => {
      if (modeRef.current !== 'rhythm' || !player?.judging) return;
      rhythmSession.advance(position, player.speed, nowMs);
    },
    [player, rhythmSession],
  );

  const activePops = useCallback(
    (nowMs: number) => (modeRef.current === 'rhythm' ? rhythmSession.activePops(nowMs) : []),
    [rhythmSession],
  );

  const expectedKey = waitView.expected.join(' ');
  const expected = useMemo<ReadonlySet<number>>(
    () => new Set(expectedKey === '' ? [] : expectedKey.split(' ').map(Number)),
    [expectedKey],
  );

  return {
    mode,
    midi,
    ports,
    sustained,
    base,
    waiting,
    expected: mode === 'wait' ? expected : NONE,
    played,
    stats: mode === 'wait' ? waitView.stats : EMPTY_WAIT_STATS,
    rhythmStats: mode === 'rhythm' ? rhythmView.stats : EMPTY_RHYTHM_STATS,
    noteHits: mode === 'rhythm' ? rhythmView.noteHits : NO_HITS,
    lastGrade: mode === 'rhythm' ? rhythmView.lastGrade : null,
    finished: mode === 'wait' ? waitView.finished : mode === 'rhythm' ? rhythmView.finished : false,
    isMine,
    pressScreen: (pitch) => {
      screen.press(pitch);
    },
    releaseScreen: (pitch) => {
      screen.release(pitch);
    },
    jumpTo,
    beforePlay,
    reset,
    advanceRhythm,
    activePops,
  };
}
