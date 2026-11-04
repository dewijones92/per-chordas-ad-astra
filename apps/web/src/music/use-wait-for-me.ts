import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { drawingClaimed } from '../annotate/use-drawing.ts';
import { ComputerKeyInput } from './computer-key-input.ts';
import { DEFAULT_BASE } from './computer-keys.ts';
import type { Lanes } from './hands.ts';
import { ScreenKeyInput, type KeyEvent, type KeySource } from './key-input.ts';
import { MidiKeyInput, type MidiStatus } from './midi-input.ts';
import type { PerfNote, Performance } from './performance.ts';
import type { PianoPlayer, PlayGate } from './player.ts';
import { playerLanes, WaitSession, waitTargets, type WaitStats } from './wait-for-me.ts';

const WAIT_REFRESH_MS = 500;

export interface WaitForMe {
  midi: MidiStatus;
  base: number;
  waiting: boolean;
  expected: ReadonlySet<number>;
  played: ReadonlySet<number>;
  stats: WaitStats;
  finished: boolean;
  isMine: ((note: PerfNote) => boolean) | null;
  pressScreen: (pitch: number) => void;
  releaseScreen: (pitch: number) => void;
  jumpTo: (song: number) => void;
  beforePlay: () => void;
  reset: () => void;
}

const EMPTY_STATS: WaitStats = { targets: 0, notes: 0, right: 0, wrong: 0, waitedMs: 0 };
const NONE: ReadonlySet<number> = new Set();

export function useWaitForMe(options: {
  enabled: boolean;
  player: PianoPlayer | null;
  perf: Performance | undefined;
  lanes: Lanes | null;
  hiddenLanes: readonly number[];
  mutedLanes: readonly number[];
  transpose: number;
  loopStart: number | null;
  playing: boolean;
}): WaitForMe {
  const { enabled, player, perf, lanes, hiddenLanes, mutedLanes, transpose, loopStart, playing } =
    options;
  const [session] = useState(() => new WaitSession());
  const version = useSyncExternalStore(session.subscribe, session.getVersion);
  const [tick, setTick] = useState(0);
  const [midi, setMidi] = useState<MidiStatus>({ state: 'off' });
  const [base, setBase] = useState(DEFAULT_BASE);
  const [played, setPlayed] = useState<ReadonlySet<number>>(NONE);
  const screen = useMemo(() => new ScreenKeyInput(), []);
  const loopStartRef = useRef(loopStart);
  useEffect(() => {
    loopStartRef.current = loopStart;
  }, [loopStart]);

  const view = useMemo(() => session.view(version, tick), [session, version, tick]);

  const isMine = useMemo(() => {
    if (!enabled || !lanes) return null;
    const mine = playerLanes(
      lanes.lanes.map((l) => l.index),
      hiddenLanes,
      mutedLanes,
    );
    console.info('dewidebug wait-for-me lanes', {
      mine: [...mine],
      hidden: hiddenLanes,
      muted: mutedLanes,
    });
    return (n: PerfNote) => mine.has(lanes.laneOf(n));
  }, [enabled, lanes, hiddenLanes, mutedLanes]);

  const targets = useMemo(
    () => (perf && isMine ? waitTargets(perf.notes, isMine, transpose) : []),
    [perf, isMine, transpose],
  );

  useEffect(() => {
    if (!enabled || !player) return;
    const gate: PlayGate = {
      limit: () => session.limit(),
      wrapped: () => {
        session.jumpTo(loopStartRef.current ?? 0, performance.now());
      },
      held: () => {
        session.arrive(performance.now());
      },
      ended: () => {
        session.finish(performance.now());
      },
    };
    player.setGate(gate);
    return () => {
      player.setGate(null);
      session.suspend(performance.now());
    };
  }, [enabled, player, session]);

  useEffect(() => {
    if (!enabled || !player) return;
    session.setTargets(targets, player.position(), performance.now());
    if (player.held) player.release();
  }, [enabled, player, session, targets]);

  useEffect(() => {
    if (!enabled || !player) return;
    const sources = new Map<number, Set<KeySource>>();
    const onKey = (e: KeyEvent) => {
      const held = sources.get(e.pitch) ?? new Set<KeySource>();
      if (e.kind === 'down') {
        held.add(e.source);
        sources.set(e.pitch, held);
        setPlayed(new Set(sources.keys()));
        player.keyDown(e.pitch, e.velocity);
        if (!player.judging) {
          console.info('dewidebug wait-for-me key not judged: not playing', {
            pitch: e.pitch,
            source: e.source,
            active: player.active,
          });
          return;
        }
        const outcome = session.press(e.pitch, e.at, player.position());
        console.info('dewidebug wait-for-me key', {
          pitch: e.pitch,
          source: e.source,
          outcome: outcome.kind,
        });
        if (outcome.kind === 'correct' && outcome.done && player.held) player.release();
        return;
      }
      held.delete(e.source);
      if (held.size > 0) return;
      sources.delete(e.pitch);
      setPlayed(new Set(sources.keys()));
      session.release(e.pitch);
      player.keyUp(e.pitch);
    };
    const inputs = [
      new MidiKeyInput(setMidi),
      new ComputerKeyInput(setBase, drawingClaimed),
      screen,
    ];
    for (const input of inputs) input.start(onKey);
    return () => {
      for (const input of inputs) input.stop();
      setPlayed(NONE);
    };
  }, [enabled, player, session, screen]);

  useEffect(() => {
    if (!enabled) return;
    if (!playing) session.suspend(performance.now());
  }, [enabled, playing, session]);

  const waiting = view.waiting;
  useEffect(() => {
    if (!enabled || !waiting) return;
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
    }, WAIT_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, waiting]);

  const jumpTo = useCallback(
    (song: number) => {
      session.jumpTo(song, performance.now());
    },
    [session],
  );

  const beforePlay = useCallback(() => {
    if (!player) return;
    if (session.finished) session.reset();
    session.jumpTo(player.startPosition(), performance.now());
  }, [player, session]);

  const reset = useCallback(() => {
    session.reset();
  }, [session]);

  const expectedKey = view.expected.join(' ');
  const expected = useMemo<ReadonlySet<number>>(
    () => new Set(expectedKey === '' ? [] : expectedKey.split(' ').map(Number)),
    [expectedKey],
  );

  return {
    midi: enabled ? midi : { state: 'off' },
    base,
    waiting: enabled && view.waiting,
    expected: enabled ? expected : NONE,
    played: enabled ? played : NONE,
    stats: enabled ? view.stats : EMPTY_STATS,
    finished: enabled && view.finished,
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
  };
}
