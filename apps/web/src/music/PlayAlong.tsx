import {
  clampLookAhead,
  MAX_TRANSPOSE,
  INSTRUMENTS,
  PLAY_ALONG_MAX_SPEED,
  PLAY_ALONG_MIN_SPEED,
  PLAY_ALONG_SPEED_STEP,
  RAMP_MAX_STEP,
  RAMP_MIN_STEP,
  newId,
  roundSpeed,
  speedPercent,
  stepLookAhead,
  type FingerText,
  type HardBit,
  type MusicRef,
  type PlayAlongPrefs,
} from '@pcaa/shared';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { api } from '../api/client.ts';
import { FingerSaves } from './finger-saves.ts';
import { DrawingStatus } from '../annotate/DrawingStatus.tsx';
import { Toolbar } from '../annotate/Toolbar.tsx';
import { fingerKeyOf, shortcutOf } from '../ui/shortcuts.ts';
import { useAnnotations } from '../annotate/use-annotations.ts';
import { claimDrawing, useDrawing, type DrawingSurface } from '../annotate/use-drawing.ts';
import { defaultToolState, type ToolState } from '../annotate/tools.ts';
import { useRememberedZoom } from '../score/use-remembered-zoom.ts';
import { useWheelZoom } from '../score/use-wheel-zoom.ts';
import { wheelLookAhead } from '../score/zoom.ts';
import { ZoomControl } from '../score/ZoomControl.tsx';
import { strings, tips, units } from '../strings.ts';
import { Choice } from '../ui/Choice.tsx';
import { useHelp } from '../ui/Help.tsx';
import { LoopSwitch } from '../ui/LoopSwitch.tsx';
import { PercentInput } from '../ui/PercentInput.tsx';
import { rememberBitTried, rememberPlayAlong, savedPlayAlong, scoreKey } from '../resume/resume.ts';
import { useAsync } from '../ui/use-async.ts';
import { staffColours } from './colours.ts';
import {
  drawFalling,
  geometry,
  keyAt,
  keyTargets,
  keyUpAt,
  noteAt,
  type FallingView,
} from './falling.ts';
import { capoFor, fitRange, keyName, noteName, signedSemitones, transposeFifths } from './keys.ts';
import { BarStrip } from './BarStrip.tsx';
import { FallingMarks, type FallingMarksState } from './FallingMarks.tsx';
import { suggestBySide } from './suggest-fingering.ts';
import { chordLabels, type ChordLabel } from './chords.ts';
import { applyHandChoice, HAND_CHOICES, handChoiceOf, hasHands } from './hand-choice.ts';
import { handColourOf, handLayers } from './hand-timelines.ts';
import { checkFile } from './file-check.ts';
import { FileCheckLine } from './FileCheckLine.tsx';
import { ResizeHandle } from './ResizeHandle.tsx';
import { readScore } from './load.ts';
import { instrumentFor, noteKey, type ScoreNote } from './model.ts';
import {
  assignHands,
  handLanes,
  LEFT_OUT,
  partLanes,
  sideOfNote,
  thinOctaves,
  type Lanes,
} from './hands.ts';
import { grandStaff, scoreHands } from './grand-staff.ts';
import { DRAW_MIN_ZOOM, Notation } from './Notation.tsx';
import { NO_FINGERS, staveSourceXml, withUserFingers } from './stave-fingers.ts';
import { toMusicXml } from './to-musicxml.ts';
import { download, exportName, performanceToMidi, transposeMusicXml } from './export.ts';
import { barAt, buildPerformance, type Performance, type PerfNote } from './performance.ts';
import { PianoPlayer, type PlayerEvent } from './player.ts';
import { useWaitForMe } from './use-wait-for-me.ts';
import { WaitForMeBar, WaitResult } from './WaitForMePanel.tsx';
import { PlayAlongLog } from './practice-session.ts';
import { clampSpeed } from './transport.ts';
import './music.css';

const CLICK_SLOP = 4;

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

function activeLoop(prefs: PlayAlongPrefs): PlayAlongPrefs['loop'] {
  return prefs.loopOn ? prefs.loop : null;
}

function loopRangeText(
  perf: Performance | undefined,
  loop: { from: number; to: number } | null,
): string | null {
  if (!perf || !loop) return null;
  const from = perf.bars[loop.from]?.number;
  const to = perf.bars[loop.to]?.number;
  return from === undefined || to === undefined ? null : units.loopBars(from, to);
}

function usePerformance(pieceId: string, file: string) {
  return useAsync(async () => {
    const res = await fetch(api.fileUrl(pieceId, file), { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Could not fetch ${file}: ${String(res.status)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const started = window.performance.now();
    const { score, text } = readScore(bytes);
    const perf = buildPerformance(score);
    console.info('dewidebug play-along parsed', {
      file,
      format: score.format,
      version: score.version,
      staves: score.staves.map((s) => s.name),
      bars: score.measures.length,
      played: perf.bars.length,
      notes: perf.notes.length,
      seconds: Math.round(perf.duration),
      ms: Math.round(window.performance.now() - started),
      warnings: perf.warnings,
    });
    return { perf, score, text };
  }, `music:${pieceId}/${file}`);
}

function FallingCanvas({
  perf,
  player,
  playing,
  transpose,
  prefs,
  colours,
  lanes,
  hiddenLanes,
  mutedLanes,
  onScrub,
  onLookAhead,
  userFingers,
  suggested,
  chords,
  handsOn,
  fingerGuess,
  selectedNote,
  onPick,
  pickedLabel,
  expected,
  played,
  onKeyDown,
  onKeyUp,
  overlay,
  marks,
}: {
  perf: Performance;
  player: PianoPlayer | null;
  playing: boolean;
  transpose: number;
  prefs: PlayAlongPrefs;
  colours: ReturnType<typeof staffColours>;
  lanes: Lanes;
  hiddenLanes: readonly number[];
  mutedLanes: readonly number[];
  onScrub: (seconds: number) => void;
  onLookAhead: Dispatch<SetStateAction<number>>;
  userFingers: ReadonlyMap<string, string>;
  suggested: ReadonlyMap<PerfNote, number> | null;
  chords: readonly ChordLabel[] | null;
  handsOn: boolean;
  fingerGuess: ReadonlyMap<PerfNote, number> | null;
  selectedNote: string | null;
  onPick: (note: PerfNote | null) => void;
  pickedLabel: string | null;
  expected: ReadonlySet<number>;
  played: ReadonlySet<number>;
  onKeyDown: ((pitch: number) => void) | null;
  onKeyUp: (pitch: number) => void;
  overlay: ReactNode;
  marks: FallingMarksState;
}) {
  const lastView = useRef<FallingView | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvas.current = el;
    setCanvasEl(el);
  }, []);
  useWheelZoom(canvasEl, onLookAhead, 'falling notes look-ahead', wheelLookAhead);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const range = useMemo(
    () => fitRange(perf.lowest + transpose, perf.highest + transpose, prefs.full),
    [perf, transpose, prefs.full],
  );
  const shownLoop = activeLoop(prefs);
  const loop = useMemo(() => {
    if (!shownLoop) return null;
    const from = perf.bars[shownLoop.from];
    const to = perf.bars[shownLoop.to];
    return from && to ? { start: from.start, end: to.end } : null;
  }, [perf, shownLoop]);
  const hidden = useMemo(() => new Set([...hiddenLanes, LEFT_OUT]), [hiddenLanes]);
  const names = useMemo(
    () => (prefs.names ? { flats: transposeFifths(perf.keyFifths, transpose) < 0 } : null),
    [prefs.names, perf.keyFifths, transpose],
  );
  const muted = useMemo(() => new Set(mutedLanes), [mutedLanes]);
  const handLayerList = useMemo(
    () =>
      handsOn
        ? handLayers({
            notes: perf.notes,
            hidden,
            laneOf: lanes.laneOf,
            sideOf: (n) => sideOfNote(lanes, n),
            userFingers,
            suggested: fingerGuess,
            transpose,
            range,
            tails: prefs.tails,
            colourOf: (side) => handColourOf(side, lanes.lanes, colours),
          })
        : [],
    [
      handsOn,
      perf,
      hidden,
      lanes,
      userFingers,
      fingerGuess,
      transpose,
      range,
      prefs.tails,
      colours,
    ],
  );

  useEffect(() => {
    const el = canvas.current?.parentElement;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || size.width === 0 || size.height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.floor(size.width * ratio);
    el.height = Math.floor(size.height * ratio);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    el.dataset['keys'] = keyTargets({
      width: size.width,
      height: size.height,
      range,
      lookAhead: prefs.lookAhead,
    });
    const draw = () => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const position = player?.position() ?? prefs.position;
      const view: FallingView = {
        perf,
        position,
        transpose,
        range,
        hidden,
        muted,
        colours,
        laneOf: lanes.laneOf,
        tails: prefs.tails,
        loop,
        names,
        lookAhead: prefs.lookAhead,
        userFingers,
        ...(suggested ? { suggested } : {}),
        ...(chords ? { chords } : {}),
        hands: handLayerList,
        selected: selectedNote,
        expected,
        played,
        width: size.width,
        height: size.height,
      };
      lastView.current = view;
      const drawn = drawFalling(ctx, view);
      el.dataset['selected'] = String(drawn.selected);
      el.dataset['suggested'] = String(drawn.suggested);
      el.dataset['chords'] = drawn.chords.join(' ');
      el.dataset['blocks'] = playing
        ? ''
        : drawn.blocks.map((b) => `${String(b.pitch)}:${String(b.x)}:${String(b.y)}`).join(' ');
      el.dataset['hands'] = playing
        ? ''
        : JSON.stringify(
            drawn.hands.map((h) => ({
              side: h.side,
              tips: Array.from(h.x, (x, f) => ({
                finger: f + 1,
                x: Math.round(x),
                down: (h.pose.dip[f] ?? 0) > 0.5,
              })),
            })),
          );
      el.dataset['position'] = position.toFixed(3);
      el.dataset['fingers'] = String(drawn.fingers);
      el.dataset['expected'] = [...expected].join(' ');
      el.dataset['played'] = [...played].join(' ');
      el.dataset['pressed'] = [...drawn.pressed]
        .map(([pitch, fill]) => `${String(pitch)}:${fill}`)
        .join(' ');
      if (playing) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    perf,
    player,
    playing,
    transpose,
    range,
    hidden,
    muted,
    colours,
    lanes,
    prefs.tails,
    loop,
    names,
    size,
    prefs.position,
    prefs.lookAhead,
    userFingers,
    suggested,
    chords,
    handLayerList,
    selectedNote,
    expected,
    played,
  ]);

  const drag = useRef<{ x: number; y: number; position: number; moved: boolean } | null>(null);
  const keyHeld = useRef<number | null>(null);
  const keyUnder = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const view = lastView.current;
    if (!view) return null;
    const box = e.currentTarget.getBoundingClientRect();
    return keyAt(view, e.clientX - box.left, e.clientY - box.top);
  };
  const releaseKey = () => {
    const held = keyHeld.current;
    keyHeld.current = null;
    if (held !== null) onKeyUp(held);
  };
  const positionNow = useCallback(
    () => player?.position() ?? prefs.position,
    [player, prefs.position],
  );
  const pxPerSecond = geometry({
    width: size.width,
    height: size.height,
    range,
    lookAhead: prefs.lookAhead,
  }).pxPerSecond;

  return (
    <div className="playalong-stage">
      {overlay}
      {pickedLabel && (
        <span className="finger-picked" data-testid="finger-picked">
          {strings.playAlong.fingerFor(pickedLabel)}
        </span>
      )}
      <canvas
        ref={canvasRef}
        className="playalong-canvas"
        data-testid="playalong-canvas"
        data-look-ahead={prefs.lookAhead}
        style={{ width: `${String(size.width)}px`, height: `${String(size.height)}px` }}
        onWheel={(e) => {
          const position = player?.position() ?? prefs.position;
          onScrub(position - e.deltaY / Math.max(1, pxPerSecond));
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const key = onKeyDown ? keyUnder(e) : null;
          if (key !== null && onKeyDown) {
            console.info('dewidebug on-screen key down', { pitch: key });
            keyHeld.current = key;
            onKeyDown(key);
            return;
          }
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            position: player?.position() ?? prefs.position,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          if (keyHeld.current !== null && onKeyDown) {
            const key = keyUnder(e);
            if (key !== null && key !== keyHeld.current) {
              onKeyUp(keyHeld.current);
              keyHeld.current = key;
              onKeyDown(key);
            }
            return;
          }
          const d = drag.current;
          if (!d) return;
          if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < CLICK_SLOP) return;
          d.moved = true;
          onScrub(d.position + (e.clientY - d.y) / Math.max(1, pxPerSecond));
        }}
        onPointerCancel={releaseKey}
        onPointerUp={(e) => {
          if (keyHeld.current !== null) {
            releaseKey();
            return;
          }
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved || !lastView.current) return;
          const box = e.currentTarget.getBoundingClientRect();
          const hit = noteAt(lastView.current, e.clientX - box.left, e.clientY - box.top);
          console.info('dewidebug falling note picked', {
            x: Math.round(e.clientX - box.left),
            y: Math.round(e.clientY - box.top),
            pitch: hit?.pitch ?? null,
            bar: hit?.bar ?? null,
          });
          onPick(hit);
        }}
      />
      <FallingMarks
        perf={perf}
        transpose={transpose}
        range={range}
        width={size.width}
        height={size.height}
        lookAhead={prefs.lookAhead}
        position={positionNow}
        playing={playing}
        marks={marks}
        onScrub={onScrub}
        onLookAhead={onLookAhead}
      />
    </div>
  );
}

export function PlayAlong({
  pieceId,
  music,
  onTranspose,
  openBit = null,
  onBitOpened,
}: {
  pieceId: string;
  music: MusicRef;
  onTranspose: (semitones: number) => void;
  openBit?: string | null;
  onBitOpened?: () => void;
}) {
  const loaded = usePerformance(pieceId, music.file);
  const perf = loaded.data?.perf;
  const key = scoreKey(pieceId, music.file);
  const [prefs, setPrefs] = useState<PlayAlongPrefs>(() => savedPlayAlong(key));
  const [playing, setPlaying] = useState(false);
  const [samples, setSamples] = useState<string | null>(null);
  const [barIndex, setBarIndex] = useState(0);
  const [drawMode, setDrawMode] = useState(false);
  const suggestHelp = useHelp(
    tips.playAlong.suggestName,
    'playalong-suggest',
    strings.playAlong.suggestHelp,
  );
  const [notationZoom, setNotationZoom] = useRememberedZoom(key);
  const sharedTools = useState<ToolState>(defaultToolState);
  const [drawSurface, chooseDrawSurface] = useState<Exclude<DrawingSurface, 'score'>>('notation');
  const notationMarks = useAnnotations(pieceId, music.file);
  const fallingMarks = useAnnotations(pieceId, music.file, 'falling');
  const drawing = useDrawing(
    'notation',
    notationMarks.history,
    notationMarks.dispatch,
    drawMode,
    sharedTools,
  );
  const fallingDrawing = useDrawing(
    'falling',
    fallingMarks.history,
    fallingMarks.dispatch,
    drawMode,
    sharedTools,
  );
  const hardBits = useAsync(() => api.getHardBits(pieceId), `hard-bits:${pieceId}`);
  const bitsLoaded = hardBits.data !== undefined;
  const bits = useMemo(() => hardBits.data?.files[music.file] ?? [], [hardBits.data, music.file]);
  const { setData: setHardBitsData, reload: reloadHardBits } = hardBits;
  const saveBits = useCallback(
    (next: HardBit[]) => {
      if (!bitsLoaded) {
        console.warn('dewidebug hard bits not saved: the saved list has not loaded', {
          file: music.file,
          count: next.length,
        });
        return;
      }
      setHardBitsData((data) => ({ files: { ...(data?.files ?? {}), [music.file]: next } }));
      api.putHardBits(pieceId, music.file, next).catch((error: unknown) => {
        console.warn('dewidebug hard bits save failed; reloading', { error: String(error) });
        reloadHardBits();
      });
    },
    [bitsLoaded, pieceId, music.file, setHardBitsData, reloadHardBits],
  );
  const readout = useRef<HTMLSpanElement>(null);
  const transpose = music.transpose;
  const notatable = loaded.data?.score.format !== 'midi';
  const sourceXml = useMemo(() => {
    const data = loaded.data;
    return data ? staveSourceXml(data.score, data.text, NO_FINGERS) : null;
  }, [loaded.data]);

  const updatePrefs = useCallback(
    (update: (p: PlayAlongPrefs) => PlayAlongPrefs) => {
      setPrefs((current) => {
        const next = update(current);
        rememberPlayAlong(key, next);
        return next;
      });
    },
    [key],
  );

  const setLookAhead = useCallback(
    (action: SetStateAction<number>) => {
      updatePrefs((p) => {
        const to =
          Math.round(
            clampLookAhead(typeof action === 'function' ? action(p.lookAhead) : action) * 10,
          ) / 10;
        return to === p.lookAhead ? p : { ...p, lookAhead: to };
      });
    },
    [updatePrefs],
  );
  const fingering = useAsync(() => api.getFingering(pieceId), `fingering:${pieceId}`);
  const { setData: setFingeringData, reload: reloadFingering } = fingering;
  const fingeringLoaded = fingering.data !== undefined;
  const fingerSaves = useRef(new FingerSaves());
  const fileFingers = fingering.data?.files[music.file];
  const userFingers = useMemo(() => new Map(Object.entries(fileFingers ?? {})), [fileFingers]);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const checkedScore = loaded.data?.score;
  const fileCheck = useMemo(() => (checkedScore ? checkFile(checkedScore) : null), [checkedScore]);
  const notationHeight = dragHeight ?? prefs.notationHeight;

  const byHand =
    prefs.byHand ??
    (perf !== undefined &&
      (prefs.playOn ?? instrumentFor(perf.staves)) === 'piano' &&
      !perf.staves.some((s) => s.role === 'left'));
  const tails = prefs.tails;
  const thin = prefs.thinOctaves;
  const leftOut = useMemo(
    () => (perf && byHand && thin ? thinOctaves(perf.notes) : null),
    [perf, byHand, thin],
  );
  const hands = useMemo(
    () =>
      perf && byHand
        ? assignHands(
            leftOut ? perf.notes.filter((n) => !leftOut.has(n)) : perf.notes,
            tails ? (n) => keyUpAt(n, true) : undefined,
          )
        : null,
    [perf, byHand, tails, leftOut],
  );
  const lanes = useMemo(
    () =>
      hands
        ? handLanes(hands, strings.playAlong.handNames, tips.playAlong.handNames)
        : perf
          ? partLanes(perf)
          : null,
    [hands, perf],
  );
  const colours = useMemo(() => (lanes ? staffColours(lanes.lanes) : []), [lanes]);
  const suggestOn = prefs.suggest;
  const playable = useMemo(
    () => (perf ? (leftOut ? perf.notes.filter((n) => !leftOut.has(n)) : perf.notes) : null),
    [perf, leftOut],
  );
  const pianoPlay = perf !== undefined && (prefs.playOn ?? instrumentFor(perf.staves)) === 'piano';
  const handsOn = pianoPlay && prefs.hands;
  const fingerGuess = useMemo(() => {
    if (!playable || !lanes || !(suggestOn || handsOn)) return null;
    return suggestBySide(playable, (n) => sideOfNote(lanes, n));
  }, [playable, lanes, suggestOn, handsOn]);
  const suggested = suggestOn ? fingerGuess : null;
  const chordsOn = prefs.chords;
  const chords = useMemo(() => {
    if (!perf || !playable || !lanes || !chordsOn) return null;
    return chordLabels(
      playable.filter((n) => sideOfNote(lanes, n) === 'left'),
      perf.bars,
      transpose,
      transposeFifths(perf.keyFifths, transpose) < 0,
    );
  }, [perf, playable, lanes, chordsOn, transpose]);
  const grandXml = useMemo(() => {
    const score = loaded.data?.score;
    if (!hands || !score?.notation || !prefs.notation) return null;
    const fingered = withUserFingers(score, userFingers);
    const grand = grandStaff(fingered, scoreHands(score.notes, hands, leftOut ?? undefined));
    return grand.notation ? toMusicXml(grand, grand.notation) : null;
  }, [loaded.data, hands, leftOut, prefs.notation, userFingers]);
  const fingeredSourceXml = useMemo(() => {
    const data = loaded.data;
    if (!data || userFingers.size === 0) return sourceXml;
    return staveSourceXml(data.score, data.text, userFingers);
  }, [loaded.data, sourceXml, userFingers]);
  const notationXml = prefs.notation ? (grandXml ?? fingeredSourceXml) : null;
  const notationXmlKey = `${music.file}:${grandXml ? 'hands' : 'file'}`;
  const activeSurface = notationXml ? drawSurface : 'falling';
  useEffect(() => {
    if (!drawMode) return;
    claimDrawing(activeSurface);
    return () => {
      claimDrawing(null);
    };
  }, [drawMode, activeSurface]);
  const hiddenLanes = byHand ? prefs.handHidden : prefs.hidden;
  const mutedLanes = byHand ? prefs.handMuted : prefs.muted;
  const hiddenKey = byHand ? 'handHidden' : 'hidden';
  const mutedKey = byHand ? 'handMuted' : 'muted';
  const handChoice = lanes
    ? handChoiceOf(lanes.lanes, { hidden: hiddenLanes, muted: mutedLanes })
    : 'none';

  const player = useMemo(() => {
    if (!perf) return null;
    const onEvent = (event: PlayerEvent) => {
      if (event.kind === 'state') setPlaying(event.playing);
      if (event.kind === 'samples') {
        setSamples(
          event.error
            ? strings.playAlong.samplesFailed
            : event.loaded < event.total
              ? strings.playAlong.samplesLoading(event.loaded, event.total)
              : null,
        );
      }
      if (event.kind === 'ended') {
        console.info('dewidebug play-along ended; back to the start');
      }
      if (event.kind === 'loop') {
        updatePrefs((p) => {
          if (Math.abs(p.speed - event.speed) < 1e-9) return p;
          console.info('dewidebug play-along loop sped up', { from: p.speed, to: event.speed });
          return { ...p, speed: event.speed };
        });
      }
    };
    return new PianoPlayer(perf, onEvent);
  }, [perf, updatePrefs]);

  useEffect(() => {
    if (!player || !perf) return;
    const initial = savedPlayAlong(key);
    player.setSpeed(initial.speed);
    player.seek(Math.min(initial.position, perf.duration));
    return () => {
      const at = player.position();
      player.dispose();
      rememberPlayAlong(key, { ...savedPlayAlong(key), position: at });
    };
  }, [player, perf, key]);

  const loopBar = activeLoop(prefs);
  const waitLoopStart = loopBar && perf ? (perf.bars[loopBar.from]?.start ?? null) : null;
  const wait = useWaitForMe({
    enabled: prefs.waitForMe,
    player,
    perf,
    lanes,
    hiddenLanes,
    mutedLanes,
    transpose,
    loopStart: waitLoopStart,
    playing,
  });
  const waitMine = wait.isMine;
  const { jumpTo: waitJumpTo, beforePlay: waitBeforePlay } = wait;

  useEffect(() => {
    if (!player || !lanes) return;
    const muted = new Set(mutedLanes);
    console.info('dewidebug play-along lanes', {
      byHand: lanes.byHand,
      lanes: lanes.lanes.map((l) => l.label),
      muted: mutedLanes,
      leftOut: leftOut?.size ?? 0,
      waitForMe: waitMine !== null,
    });
    player.setInclude((n) => {
      const lane = lanes.laneOf(n);
      return lane !== LEFT_OUT && !muted.has(lane) && !(waitMine?.(n) ?? false);
    });
  }, [player, lanes, mutedLanes, leftOut, waitMine]);

  const applied = activeLoop(prefs);
  const loopFrom = applied?.from ?? null;
  const loopTo = applied?.to ?? null;
  useEffect(() => {
    if (!player || !perf) return;
    const from = loopFrom === null ? undefined : perf.bars[loopFrom];
    const to = loopTo === null ? undefined : perf.bars[loopTo];
    console.info('dewidebug play-along loop applied', { from: loopFrom, to: loopTo });
    player.setLoop(from && to ? { start: from.start, end: to.end } : null);
    waitJumpTo(player.position());
  }, [player, perf, loopFrom, loopTo, waitJumpTo]);

  useEffect(() => {
    player?.setTranspose(transpose);
  }, [player, transpose]);

  useEffect(() => {
    player?.setSpeed(prefs.speed);
  }, [player, prefs.speed]);

  useEffect(() => {
    player?.setRamp(prefs.ramp ? { step: prefs.rampStep, target: prefs.rampTarget } : null);
  }, [player, prefs.ramp, prefs.rampStep, prefs.rampTarget]);

  useEffect(() => {
    player?.setClick(prefs.click || prefs.drums, prefs.halfBeats, prefs.drums);
  }, [player, prefs.click, prefs.halfBeats, prefs.drums]);

  const [practice] = useState(() => new PlayAlongLog());
  const logTarget = useMemo(
    () => ({ pieceId, name: music.name, baseBpm: perf?.baseBpm ?? null }),
    [pieceId, music.name, perf],
  );
  const submitPractice = useCallback(
    (keepalive: boolean) => {
      const session = practice.take(Date.now(), logTarget);
      if (!session) return;
      console.info('dewidebug play-along practice logged', session);
      api.addSession(session, keepalive).catch((error: unknown) => {
        console.warn('dewidebug play-along practice log failed', { error: String(error) });
      });
    },
    [practice, logTarget],
  );

  useEffect(() => {
    if (playing) practice.play(Date.now(), prefs.speed);
    else practice.pause(Date.now());
  }, [practice, playing, prefs.speed]);

  const loopText = loopRangeText(perf, activeLoop(prefs));
  useEffect(() => {
    if (playing && loopText) practice.noteLoop(loopText);
  }, [practice, playing, loopText]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (practice.due(Date.now())) submitPractice(false);
    }, 15_000);
    const onHide = () => {
      practice.pause(Date.now());
      submitPractice(true);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      practice.pause(Date.now());
      submitPractice(true);
    };
  }, [practice, submitPractice]);

  const loopNow = activeLoop(prefs);
  useEffect(() => {
    if (!player) return;
    player.setPassListener((speed) => {
      if (!loopNow) return;
      const bit = bits.find((b) => b.from === loopNow.from && b.to === loopNow.to);
      if (!bit || speed <= bit.bestSpeed + 1e-9) return;
      console.info('dewidebug hard bit new best', {
        name: bit.name,
        from: bit.bestSpeed,
        to: speed,
      });
      setHardBitsData((data) => ({
        files: {
          ...(data?.files ?? {}),
          [music.file]: bits.map((b) => (b.id === bit.id ? { ...b, bestSpeed: speed } : b)),
        },
      }));
      api.putHardBitBest(pieceId, music.file, bit.id, speed).catch((error: unknown) => {
        console.warn('dewidebug hard bit best save failed; reloading', { error: String(error) });
        reloadHardBits();
      });
    });
  }, [player, loopNow, bits, pieceId, music.file, setHardBitsData, reloadHardBits]);

  useEffect(() => {
    if (!player || !perf) return;
    let frame = 0;
    let shownBar = -1;
    const tick = () => {
      const position = player.position();
      const index = barAt(perf, position);
      const bar = perf.bars[index];
      if (index !== shownBar) {
        shownBar = index;
        setBarIndex(index);
      }
      if (readout.current) {
        readout.current.textContent = strings.playAlong.position(
          bar?.number ?? 1,
          clock(position),
          clock(perf.duration),
        );
      }
      if (player.active) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [player, perf, playing, prefs.position]);

  const toggle = useCallback(() => {
    if (!player) return;
    if (player.active || player.starting) {
      player.pause();
      updatePrefs((p) => ({ ...p, position: player.position() }));
    } else {
      setDrawMode(false);
      waitBeforePlay();
      player.play(prefs.countIn).catch((error: unknown) => {
        console.warn('dewidebug play-along could not start audio', { error: String(error) });
      });
    }
  }, [player, updatePrefs, prefs.countIn, waitBeforePlay]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!player || !perf) return;
      const target = Math.min(Math.max(0, seconds), perf.duration);
      waitJumpTo(target);
      player.seek(target);
      if (!player.playing) updatePrefs((p) => ({ ...p, position: target }));
    },
    [player, perf, updatePrefs, waitJumpTo],
  );

  const chooseBit = useCallback(
    (b: HardBit) => {
      console.info('dewidebug hard bit chosen', { name: b.name, from: b.from, to: b.to });
      updatePrefs((p) => ({ ...p, loop: { from: b.from, to: b.to }, loopOn: true }));
      const bar = perf?.bars[b.from];
      if (bar && player && !player.playing) seekTo(bar.start);
    },
    [updatePrefs, perf, player, seekTo],
  );

  const openLinkedBit = useEffectEvent((wanted: HardBit | undefined) => {
    if (wanted) chooseBit(wanted);
    onBitOpened?.();
  });
  useEffect(() => {
    if (openBit === null || !bitsLoaded || !perf || !player) return;
    const wanted = bits.find((b) => b.id === openBit);
    console.info('dewidebug hard bit opened from a link', {
      id: openBit,
      found: wanted?.name ?? null,
    });
    const timer = window.setTimeout(() => {
      openLinkedBit(wanted);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [openBit, bitsLoaded, bits, perf, player]);

  const loopBitId = loopNow
    ? (bits.find((b) => b.from === loopNow.from && b.to === loopNow.to)?.id ?? null)
    : null;
  useEffect(() => {
    if (!playing || loopBitId === null) return;
    console.info('dewidebug hard bit tried', { id: loopBitId });
    rememberBitTried(pieceId, music.file, loopBitId);
  }, [playing, loopBitId, pieceId, music.file]);

  const pausedAt = prefs.position;
  const notationPosition = useCallback(
    () => (player?.playing ? player.position() : (player?.position() ?? pausedAt)),
    [player, pausedAt],
  );

  const stepBar = useCallback(
    (delta: -1 | 1) => {
      if (!player || !perf) return;
      const index = barAt(perf, player.position() + 0.001);
      const bar = perf.bars[Math.min(perf.bars.length - 1, Math.max(0, index + delta))];
      if (bar) seekTo(bar.start);
    },
    [player, perf, seekTo],
  );

  const setSpeed = useCallback(
    (speed: number) => {
      const clamped = roundSpeed(clampSpeed(speed));
      updatePrefs((p) => ({ ...p, speed: clamped }));
    },
    [updatePrefs],
  );

  const [picked, setPicked] = useState<{ key: string; label: string } | null>(null);
  const pickWritten = useCallback(
    (source: ScoreNote | null) => {
      if (!source || !perf) {
        setPicked(null);
        return;
      }
      const label = units.noteInBar(
        noteName(source.pitch, perf.keyFifths < 0),
        perf.bars.find((b) => b.measure === source.measure)?.number ?? source.measure + 1,
      );
      setPicked({ key: noteKey(source), label });
    },
    [perf],
  );
  const pickNote = useCallback(
    (n: PerfNote | null) => {
      pickWritten(n?.source ?? null);
    },
    [pickWritten],
  );
  const setFinger = useCallback(
    (finger: FingerText | null) => {
      if (!picked) return;
      if (!fingeringLoaded) {
        console.warn('dewidebug finger not saved: the saved fingering has not loaded', picked);
        return;
      }
      console.info('dewidebug finger set', { ...picked, finger, file: music.file });
      const change = { note: picked.key, finger, label: picked.label };
      const ticket = fingerSaves.current.begin(fingering.data);
      setFingeringData((data) => {
        const { [picked.key]: _was, ...rest } = data?.files[music.file] ?? {};
        const notes = finger === null ? rest : { ...rest, [picked.key]: finger };
        return { files: { ...(data?.files ?? {}), [music.file]: notes } };
      });
      api.putFinger(pieceId, music.file, change).then(
        (saved) => {
          const settled = fingerSaves.current.succeeded(ticket, music.file, saved.notes);
          console.info('dewidebug finger saved', { ticket, shownAgain: settled !== null });
          if (settled) setFingeringData(() => settled);
        },
        (error: unknown) => {
          const settled = fingerSaves.current.failed();
          console.warn('dewidebug finger save failed; showing the last confirmed fingering', {
            ticket,
            error: String(error),
            shownAgain: settled !== null,
          });
          if (settled) setFingeringData(() => settled);
          reloadFingering();
        },
      );
    },
    [
      picked,
      fingeringLoaded,
      fingering.data,
      music.file,
      pieceId,
      setFingeringData,
      reloadFingering,
    ],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const finger = picked && !drawMode ? fingerKeyOf(e) : null;
      if (finger) {
        e.preventDefault();
        setFinger(finger === 'clear' ? null : finger);
        return;
      }
      if (picked && e.key === 'Escape') {
        setPicked(null);
        return;
      }
      const shortcut = shortcutOf(e);
      if (shortcut === 'playPause') {
        e.preventDefault();
        console.info('dewidebug play-along key', {
          key: e.key,
          target: (e.target as HTMLElement | null)?.tagName,
        });
        toggle();
      } else if (shortcut === 'slower') {
        setSpeed(prefs.speed - PLAY_ALONG_SPEED_STEP);
      } else if (shortcut === 'faster') {
        setSpeed(prefs.speed + PLAY_ALONG_SPEED_STEP);
      } else if (shortcut === 'previousBar') {
        stepBar(-1);
      } else if (shortcut === 'nextBar') {
        stepBar(1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [toggle, setSpeed, stepBar, prefs.speed, picked, setFinger, drawMode]);

  if (loaded.error) {
    return (
      <section className="playalong" aria-label={tips.playAlong.panel}>
        <p className="error" data-testid="playalong-error">
          {strings.playAlong.couldNotRead(music.name, loaded.error)}
        </p>
      </section>
    );
  }
  if (!perf) {
    return (
      <section className="playalong" aria-label={tips.playAlong.panel}>
        <p className="muted playalong-loading">{strings.playAlong.reading(music.name)}</p>
      </section>
    );
  }

  const currentBar = () => (player ? barAt(perf, player.position() + 0.001) : 0);
  const writtenKey = keyName(perf.keyFifths, perf.keyMinor);
  const playedKey = keyName(transposeFifths(perf.keyFifths, transpose), perf.keyMinor);
  const playOn = prefs.playOn ?? instrumentFor(perf.staves);
  const capo = playOn === 'guitar' ? capoFor(transpose) : null;
  const loopLabel = prefs.loop
    ? strings.playAlong.loopBars(
        String(perf.bars[prefs.loop.from]?.number ?? '?'),
        String(perf.bars[prefs.loop.to]?.number ?? '?'),
      )
    : strings.playAlong.loopOff;

  return (
    <section
      className={`playalong${drawMode ? ' is-drawing' : ''}${prefs.compact ? ' is-compact' : ''}`}
      aria-label={tips.playAlong.panel}
      data-testid="playalong"
    >
      <div className="playalong-bar">
        <button
          type="button"
          className={`btn small ${playing ? 'coral' : 'primary'}`}
          data-testid="playalong-play"
          aria-pressed={playing}
          title={tips.playAlong.play}
          onClick={toggle}
        >
          {playing ? strings.common.pause : strings.common.play}
        </button>
        <button
          type="button"
          className="btn small icon"
          aria-label={tips.playAlong.toStart}
          onClick={() => {
            const on = activeLoop(prefs);
            const from = on ? perf.bars[on.from] : undefined;
            seekTo(from?.start ?? 0);
          }}
        >
          ⏮
        </button>
        <button
          type="button"
          className="btn small icon"
          aria-label={tips.playAlong.previousBar}
          title={tips.playAlong.previousBarTitle}
          onClick={() => {
            stepBar(-1);
          }}
        >
          ‹
        </button>
        <button
          type="button"
          className="btn small icon"
          aria-label={tips.playAlong.nextBar}
          title={tips.playAlong.nextBarTitle}
          onClick={() => {
            stepBar(1);
          }}
        >
          ›
        </button>
        <span className="playalong-readout" ref={readout} data-testid="playalong-position" />
        <button
          type="button"
          className="btn small ghost"
          aria-pressed={prefs.waitForMe}
          title={tips.playAlong.waitForMe}
          data-testid="playalong-wait"
          onClick={() => {
            console.info('dewidebug play-along wait for me', { on: !prefs.waitForMe });
            updatePrefs((p) => ({ ...p, waitForMe: !p.waitForMe }));
          }}
        >
          {strings.playAlong.waitForMe}
        </button>
        <span className="spacer" />
        <span
          className="playalong-field"
          title={tips.playAlong.lookAhead}
          data-testid="playalong-look-ahead"
        >
          <span className="playalong-label">{strings.playAlong.lookAhead}</span>
          <ZoomControl
            zoom={prefs.lookAhead}
            onZoom={(seconds) => {
              console.info('dewidebug look-ahead by button', {
                from: prefs.lookAhead,
                to: seconds,
              });
              setLookAhead(seconds);
            }}
            step={stepLookAhead}
            format={units.seconds}
            less={tips.playAlong.lookAheadLess}
            more={tips.playAlong.lookAheadMore}
            testId="playalong-look-ahead-value"
          />
        </span>
        <span className="playalong-field playalong-speed" title={tips.playAlong.speed}>
          <span className="playalong-label">{strings.common.speed}</span>
          <button
            type="button"
            className="btn small icon"
            aria-label={tips.playAlong.slower}
            disabled={prefs.speed <= PLAY_ALONG_MIN_SPEED}
            onClick={() => {
              setSpeed(prefs.speed - PLAY_ALONG_SPEED_STEP);
            }}
          >
            −
          </button>
          <input
            type="range"
            min={PLAY_ALONG_MIN_SPEED * 100}
            max={PLAY_ALONG_MAX_SPEED * 100}
            step={PLAY_ALONG_SPEED_STEP * 100}
            value={speedPercent(prefs.speed)}
            aria-label={tips.playAlong.speedLabel}
            onChange={(e) => {
              setSpeed(Number(e.target.value) / 100);
            }}
          />
          <button
            type="button"
            className="btn small icon"
            aria-label={tips.playAlong.faster}
            disabled={prefs.speed >= PLAY_ALONG_MAX_SPEED}
            onClick={() => {
              setSpeed(prefs.speed + PLAY_ALONG_SPEED_STEP);
            }}
          >
            +
          </button>
          <PercentInput
            value={prefs.speed}
            min={PLAY_ALONG_MIN_SPEED}
            max={PLAY_ALONG_MAX_SPEED}
            step={PLAY_ALONG_SPEED_STEP}
            label={tips.playAlong.exactSpeed}
            testId="playalong-speed"
            onChange={setSpeed}
          />
        </span>
        <button
          type="button"
          className="btn small ghost"
          aria-pressed={prefs.compact}
          title={tips.playAlong.compact}
          data-testid="playalong-compact"
          onClick={() => {
            console.info('dewidebug play-along controls', { compact: !prefs.compact });
            updatePrefs((p) => ({ ...p, compact: !p.compact }));
          }}
        >
          {prefs.compact ? strings.playAlong.moreControls : strings.playAlong.fewerControls}
        </button>
      </div>
      {prefs.waitForMe && (
        <WaitForMeBar
          wait={wait}
          playing={playing}
          flats={transposeFifths(perf.keyFifths, transpose) < 0}
        />
      )}
      <div className="playalong-bar playalong-settings">
        <span className="playalong-field" data-testid="playalong-transpose">
          <span>{strings.playAlong.key}</span>
          <button
            type="button"
            className="btn small icon"
            aria-label={tips.playAlong.down}
            disabled={transpose <= -MAX_TRANSPOSE}
            onClick={() => {
              onTranspose(transpose - 1);
            }}
          >
            −
          </button>
          <span className="playalong-key" data-testid="playalong-key">
            {transpose === 0 ? (
              <strong>{writtenKey}</strong>
            ) : (
              <>
                <span className="muted">{units.writtenIn}</span> <strong>{writtenKey}</strong>
                <span aria-hidden="true">→</span> <span className="muted">{units.now}</span>{' '}
                <strong>{playedKey}</strong>
              </>
            )}{' '}
            <span className="muted">({signedSemitones(transpose)})</span>
          </span>
          <button
            type="button"
            className="btn small icon"
            aria-label={tips.playAlong.up}
            disabled={transpose >= MAX_TRANSPOSE}
            onClick={() => {
              onTranspose(transpose + 1);
            }}
          >
            +
          </button>
          {transpose !== 0 && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                onTranspose(0);
              }}
            >
              {strings.playAlong.reset}
            </button>
          )}
          {capo !== null && (
            <span
              className="playalong-capo"
              data-testid="playalong-capo"
              title={tips.playAlong.capo(capo, playedKey)}
            >
              {strings.playAlong.capo(capo)}
            </span>
          )}
        </span>
        <Choice
          label={strings.playAlong.playOn}
          title={tips.playAlong.playOn}
          value={prefs.playOn ?? 'auto'}
          options={(['auto', ...INSTRUMENTS] as const).map((i) => ({
            value: i,
            label: strings.playAlong.playOnModes[i],
            tip: tips.playAlong.playOnModes[i],
          }))}
          testId="playalong-play-on"
          help={strings.playAlong.playOnHelp}
          note={
            prefs.playOn === null
              ? strings.playAlong.autoChose(
                  strings.playAlong.playOnModes[playOn],
                  playOn === 'guitar' ? units.autoWhy.guitarPart : units.autoWhy.noGuitarPart,
                )
              : null
          }
          onChange={(next) => {
            updatePrefs((p) => ({ ...p, playOn: next === 'auto' ? null : next }));
          }}
        />
        {fileCheck && <FileCheckLine check={fileCheck} />}
        <span className="playalong-field" data-testid="playalong-export">
          <span>{strings.playAlong.export}</span>
          <button
            type="button"
            className="btn small ghost"
            disabled={!sourceXml}
            title={tips.playAlong.exportXml(playedKey)}
            onClick={() => {
              if (!sourceXml) return;
              const xml = transposeMusicXml(sourceXml, transpose, perf.keyFifths);
              download(
                exportName(music.name, transpose, 'musicxml'),
                xml,
                'application/vnd.recordare.musicxml+xml',
              );
            }}
          >
            {strings.playAlong.exportXml}
          </button>
          <button
            type="button"
            className="btn small ghost"
            title={tips.playAlong.exportMidi(playedKey)}
            onClick={() => {
              download(
                exportName(music.name, transpose, 'mid'),
                performanceToMidi(perf, transpose),
                'audio/midi',
              );
            }}
          >
            {strings.playAlong.exportMidi}
          </button>
        </span>
        <span className="playalong-field" data-testid="playalong-loop">
          <LoopSwitch
            on={prefs.loopOn && prefs.loop !== null}
            disabled={!prefs.loop}
            onChange={(loopOn) => {
              updatePrefs((p) => ({ ...p, loopOn }));
            }}
            testId="playalong-loop-on"
          />
          <strong className={prefs.loopOn ? '' : 'muted'}>{loopLabel}</strong>
          <button
            type="button"
            className="btn small ghost"
            title={tips.playAlong.fromHere}
            onClick={() => {
              const at = currentBar();
              updatePrefs((p) => ({
                ...p,
                loop: { from: at, to: p.loop && p.loop.to >= at ? p.loop.to : at },
                loopOn: true,
              }));
            }}
          >
            {strings.playAlong.fromHere}
          </button>
          <button
            type="button"
            className="btn small ghost"
            title={tips.playAlong.toHere}
            onClick={() => {
              const at = currentBar();
              updatePrefs((p) => ({
                ...p,
                loop: { from: p.loop && p.loop.from <= at ? p.loop.from : at, to: at },
                loopOn: true,
              }));
            }}
          >
            {strings.playAlong.toHere}
          </button>
          {prefs.loop && (
            <button
              type="button"
              className="btn small ghost"
              aria-label={tips.playAlong.clearLoop}
              onClick={() => {
                updatePrefs((p) => ({ ...p, loop: null }));
              }}
            >
              ✕
            </button>
          )}
        </span>
        <span
          className="playalong-field"
          title={tips.playAlong.ramp(speedPercent(prefs.rampStep), speedPercent(prefs.rampTarget))}
        >
          <label className="playalong-field">
            <input
              type="checkbox"
              checked={prefs.ramp}
              data-testid="playalong-ramp"
              onChange={(e) => {
                const ramp = e.target.checked;
                updatePrefs((p) => ({ ...p, ramp }));
              }}
            />
            {strings.playAlong.ramp}
          </label>
          {prefs.ramp && (
            <>
              <span className="muted">{units.by}</span>
              <PercentInput
                value={prefs.rampStep}
                min={RAMP_MIN_STEP}
                max={RAMP_MAX_STEP}
                step={PLAY_ALONG_SPEED_STEP}
                label={tips.playAlong.rampStep}
                testId="playalong-ramp-step"
                onChange={(rampStep) => {
                  updatePrefs((p) => ({ ...p, rampStep: roundSpeed(rampStep) }));
                }}
              />
              <span className="muted">{units.upTo}</span>
              <PercentInput
                value={prefs.rampTarget}
                min={PLAY_ALONG_MIN_SPEED}
                max={PLAY_ALONG_MAX_SPEED}
                step={PLAY_ALONG_SPEED_STEP}
                label={tips.playAlong.rampTarget}
                testId="playalong-ramp-target"
                onChange={(rampTarget) => {
                  updatePrefs((p) => ({ ...p, rampTarget: roundSpeed(rampTarget) }));
                }}
              />
            </>
          )}
        </span>
        <span className="spacer" />
        <label className="playalong-field">
          <input
            type="checkbox"
            checked={prefs.full}
            onChange={(e) => {
              const full = e.target.checked;
              updatePrefs((p) => ({ ...p, full }));
            }}
          />
          {strings.playAlong.fullKeyboard}
        </label>
        <label className="playalong-field" title={tips.playAlong.countIn}>
          <input
            type="checkbox"
            checked={prefs.countIn}
            data-testid="playalong-countin"
            onChange={(e) => {
              const countIn = e.target.checked;
              updatePrefs((p) => ({ ...p, countIn }));
            }}
          />
          {strings.playAlong.countIn}
        </label>
        <label className="playalong-field" title={tips.playAlong.click}>
          <input
            type="checkbox"
            checked={prefs.click}
            data-testid="playalong-click"
            onChange={(e) => {
              const click = e.target.checked;
              updatePrefs((p) => ({ ...p, click }));
            }}
          />
          {strings.playAlong.click}
        </label>
        <label className="playalong-field" title={tips.playAlong.drums}>
          <input
            type="checkbox"
            checked={prefs.drums}
            data-testid="playalong-drums"
            onChange={(e) => {
              const drums = e.target.checked;
              updatePrefs((p) => ({ ...p, drums }));
            }}
          />
          {strings.playAlong.drums}
        </label>
        {(prefs.click || prefs.drums) && (
          <label className="playalong-field" title={tips.playAlong.halfBeats}>
            <input
              type="checkbox"
              checked={prefs.halfBeats}
              data-testid="playalong-half-beats"
              onChange={(e) => {
                const halfBeats = e.target.checked;
                updatePrefs((p) => ({ ...p, halfBeats }));
              }}
            />
            {strings.playAlong.halfBeats}
          </label>
        )}
        {notatable && (
          <label className="playalong-field">
            <input
              type="checkbox"
              checked={prefs.notation}
              data-testid="playalong-notation"
              onChange={(e) => {
                const notation = e.target.checked;
                updatePrefs((p) => ({ ...p, notation }));
              }}
            />
            {strings.playAlong.notation}
          </label>
        )}
        <button
          type="button"
          className="btn small ghost"
          data-testid="notation-draw"
          aria-pressed={drawMode}
          title={tips.notation.draw}
          onClick={() => {
            if (drawMode) {
              console.info('dewidebug draw mode off');
              setDrawMode(false);
              return;
            }
            if (player?.active || player?.starting) toggle();
            if (notatable && !prefs.notation) updatePrefs((p) => ({ ...p, notation: true }));
            console.info('dewidebug draw mode on', {
              file: music.file,
              zoom: notationZoom,
              notatable,
              pickedLetGo: picked?.label ?? null,
            });
            if (notatable) setNotationZoom((z) => Math.max(z, DRAW_MIN_ZOOM));
            chooseDrawSurface(notatable ? 'notation' : 'falling');
            setPicked(null);
            setDrawMode(true);
          }}
        >
          {strings.notation.draw}
        </button>
        <label className="playalong-field">
          <input
            type="checkbox"
            checked={prefs.names}
            data-testid="playalong-names"
            onChange={(e) => {
              const names = e.target.checked;
              updatePrefs((p) => ({ ...p, names }));
            }}
          />
          {strings.playAlong.noteNames}
        </label>
        <label className="playalong-field" title={tips.playAlong.suggest}>
          <input
            type="checkbox"
            checked={prefs.suggest}
            data-testid="playalong-suggest"
            onChange={(e) => {
              const suggest = e.target.checked;
              updatePrefs((p) => ({ ...p, suggest }));
            }}
          />
          {strings.playAlong.suggest}
        </label>
        {suggestHelp.button}
        {suggestHelp.text}
        {pianoPlay && (
          <label className="playalong-field" title={tips.playAlong.showHands}>
            <input
              type="checkbox"
              checked={prefs.hands}
              data-testid="playalong-hands"
              onChange={(e) => {
                const hands = e.target.checked;
                console.info('dewidebug hands shown', { on: hands });
                updatePrefs((p) => ({ ...p, hands }));
              }}
            />
            {strings.playAlong.showHands}
          </label>
        )}
        <label className="playalong-field" title={tips.playAlong.chordNames}>
          <input
            type="checkbox"
            checked={prefs.chords}
            data-testid="playalong-chords"
            onChange={(e) => {
              const chords = e.target.checked;
              console.info('dewidebug chord names', { on: chords });
              updatePrefs((p) => ({ ...p, chords }));
            }}
          />
          {strings.playAlong.chordNames}
        </label>
        <label className="playalong-field" title={tips.playAlong.tails}>
          <input
            type="checkbox"
            checked={prefs.tails}
            data-testid="playalong-tails"
            onChange={(e) => {
              const tails = e.target.checked;
              updatePrefs((p) => ({ ...p, tails }));
            }}
          />
          {strings.playAlong.tails}
        </label>
        {samples && <span className="muted small-print">{samples}</span>}
      </div>
      <div
        className="playalong-parts playalong-bits playalong-settings"
        aria-label={tips.playAlong.hardBits}
        data-testid="hard-bits"
      >
        <span className="playalong-field">{strings.playAlong.hardBits}</span>
        {hardBits.error && !bitsLoaded && (
          <span className="error small-print" data-testid="hard-bits-error">
            {strings.playAlong.hardBitsFailed} {hardBits.error}{' '}
            <button type="button" className="btn small ghost" onClick={reloadHardBits}>
              {strings.common.retry}
            </button>
          </span>
        )}
        {bitsLoaded && bits.length === 0 && (
          <span className="muted small-print">{strings.playAlong.hardBitsEmpty}</span>
        )}
        {bits.map((b) => {
          const on = activeLoop(prefs);
          const active = on?.from === b.from && on.to === b.to;
          return (
            <span key={b.id} className="playalong-part" data-testid="hard-bit">
              <button
                type="button"
                className="btn small ghost"
                aria-pressed={active}
                title={tips.playAlong.hardBit(b.fromBar, b.toBar)}
                onClick={() => {
                  chooseBit(b);
                }}
              >
                {b.name}
              </button>
              <span className="muted small-print" data-testid="hard-bit-best">
                {strings.playAlong.best(speedPercent(b.bestSpeed))}
              </span>
              <button
                type="button"
                className="btn small ghost icon part-toggle"
                aria-label={tips.playAlong.forget(b.name)}
                onClick={() => {
                  if (!window.confirm(strings.playAlong.forgetConfirm(b.name))) return;
                  saveBits(bits.filter((x) => x.id !== b.id));
                }}
              >
                ✕
              </button>
            </span>
          );
        })}
        {bitsLoaded &&
          prefs.loop &&
          !bits.some((b) => b.from === prefs.loop?.from && b.to === prefs.loop.to) && (
            <button
              type="button"
              className="btn small sun"
              data-testid="save-hard-bit"
              onClick={() => {
                const loop = prefs.loop;
                if (!loop) return;
                const fromBar = perf.bars[loop.from]?.number ?? 0;
                const toBar = perf.bars[loop.to]?.number ?? 0;
                const name = window.prompt(
                  strings.playAlong.hardBitPrompt,
                  `Bars ${String(fromBar)}–${String(toBar)}`,
                );
                if (!name?.trim()) return;
                saveBits([
                  ...bits,
                  {
                    id: newId(),
                    name: name.trim(),
                    from: loop.from,
                    to: loop.to,
                    fromBar,
                    toBar,
                    bestSpeed: 0,
                  },
                ]);
              }}
            >
              {strings.playAlong.saveHardBit}
            </button>
          )}
      </div>
      <div className="playalong-parts playalong-settings" aria-label={tips.playAlong.parts}>
        <Choice
          label={strings.playAlong.hands}
          title={tips.playAlong.showHands}
          value={prefs.byHand === null ? 'auto' : prefs.byHand ? 'hands' : 'parts'}
          options={(['auto', 'parts', 'hands'] as const).map((m) => ({
            value: m,
            label: strings.playAlong.handModes[m],
            tip: tips.playAlong.handModes[m],
          }))}
          testId="playalong-by-hand"
          help={strings.playAlong.handsHelp}
          note={
            prefs.byHand === null
              ? strings.playAlong.autoChose(
                  strings.playAlong.handModes[byHand ? 'hands' : 'parts'],
                  byHand
                    ? units.autoWhy.noPianoStaves
                    : playOn === 'guitar'
                      ? units.autoWhy.guitar
                      : units.autoWhy.pianoStaves,
                )
              : null
          }
          onChange={(next) => {
            updatePrefs((p) => ({ ...p, byHand: next === 'auto' ? null : next === 'hands' }));
          }}
        />
        {byHand && (
          <label className="playalong-field" title={tips.playAlong.thinOctaves}>
            <input
              type="checkbox"
              checked={prefs.thinOctaves}
              data-testid="playalong-thin-octaves"
              onChange={(e) => {
                const thinOctaves = e.target.checked;
                updatePrefs((p) => ({ ...p, thinOctaves }));
              }}
            />
            {strings.playAlong.thinOctaves}
          </label>
        )}
        {lanes && hasHands(lanes.lanes) && (
          <Choice
            label={strings.playAlong.iPlay}
            title={tips.playAlong.iPlay}
            value={handChoice}
            options={HAND_CHOICES.map((c) => ({
              value: c,
              label: strings.playAlong.iPlayModes[c],
              tip: tips.playAlong.iPlayModes[c],
            }))}
            testId="playalong-i-play"
            help={strings.playAlong.iPlayHelp}
            note={handChoice === 'custom' ? strings.playAlong.iPlayCustom : null}
            onChange={(choice) => {
              if (choice === 'custom') return;
              updatePrefs((p) => {
                const applied = applyHandChoice(lanes.lanes, choice, {
                  hidden: p[hiddenKey],
                  muted: p[mutedKey],
                });
                console.info('dewidebug i play', { choice, byHand, ...applied });
                return { ...p, [hiddenKey]: applied.hidden, [mutedKey]: applied.muted };
              });
            }}
          />
        )}
        {(lanes?.lanes ?? []).map((s) => {
          const colour = colours[s.index];
          const isHidden = hiddenLanes.includes(s.index);
          const isMuted = mutedLanes.includes(s.index);
          return (
            <span key={s.index} className="playalong-part" data-testid="playalong-part">
              <span className="playalong-swatch" style={{ background: colour?.fill }} />
              <span className={isHidden ? 'muted' : ''}>{s.name}</span>
              <button
                type="button"
                className="btn small ghost icon part-toggle"
                aria-label={isHidden ? tips.playAlong.show(s.label) : tips.playAlong.hide(s.label)}
                onClick={() => {
                  updatePrefs((p) => ({
                    ...p,
                    [hiddenKey]: isHidden
                      ? p[hiddenKey].filter((h) => h !== s.index)
                      : [...p[hiddenKey], s.index],
                  }));
                }}
              >
                {isHidden ? '🙈' : '👁'}
              </button>
              <button
                type="button"
                className="btn small ghost icon part-toggle"
                aria-label={isMuted ? tips.playAlong.unmute(s.label) : tips.playAlong.mute(s.label)}
                onClick={() => {
                  updatePrefs((p) => ({
                    ...p,
                    [mutedKey]: isMuted
                      ? p[mutedKey].filter((m) => m !== s.index)
                      : [...p[mutedKey], s.index],
                  }));
                }}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
            </span>
          );
        })}
        {perf.warnings.length > 0 && (
          <span className="muted small-print" title={perf.warnings.join('\n')}>
            {strings.playAlong.warning(perf.warnings[0] ?? '')}
            {perf.warnings.length > 1 ? units.moreWarnings(perf.warnings.length - 1) : ''}
          </span>
        )}
      </div>
      {drawMode && (
        <>
          <Toolbar
            {...(activeSurface === 'falling' ? fallingDrawing : drawing).toolbar}
            zoom={notationZoom}
            onZoom={setNotationZoom}
            extra={
              <button
                type="button"
                className="btn small primary"
                data-testid="notation-draw-done"
                onClick={() => {
                  console.info('dewidebug notation draw mode off');
                  setDrawMode(false);
                }}
              >
                {strings.common.done}
              </button>
            }
          />
          <DrawingStatus
            load={notationMarks.load}
            error={notationMarks.error}
            reload={notationMarks.reload}
          />
          <DrawingStatus
            load={fallingMarks.load}
            error={fallingMarks.error}
            reload={fallingMarks.reload}
          />
        </>
      )}
      {notationXml && loaded.data && (
        <>
          <Notation
            xml={notationXml}
            xmlKey={notationXmlKey}
            transpose={transpose}
            perf={perf}
            measures={loaded.data.score.measures}
            notes={loaded.data.score.notes}
            pickedKey={picked?.key ?? null}
            onPickNote={pickWritten}
            playing={playing}
            position={notationPosition}
            onSeek={seekTo}
            zoom={notationZoom}
            onZoom={setNotationZoom}
            height={drawMode ? null : notationHeight}
            drawing={drawMode}
            marks={{
              history: notationMarks.history,
              dispatch: notationMarks.dispatch,
              tools: drawing.tools,
              selected: drawMode ? drawing.selected : null,
              onSelect: drawing.setSelected,
              editable: notationMarks.load === 'ready',
              onClaim: () => {
                chooseDrawSurface('notation');
              },
            }}
          />
          {!drawMode && (
            <ResizeHandle
              label={tips.playAlong.resize}
              testId="playalong-resize"
              onDrag={setDragHeight}
              onDone={(height) => {
                setDragHeight(null);
                updatePrefs((p) => ({ ...p, notationHeight: height }));
              }}
            />
          )}
        </>
      )}
      <BarStrip
        bars={perf.bars}
        current={barIndex}
        loop={prefs.loop}
        loopOff={!prefs.loopOn}
        onSeek={(index) => {
          const bar = perf.bars[index];
          if (bar) seekTo(bar.start);
        }}
        onLoop={(range) => {
          console.info('dewidebug play-along loop chosen on the bar strip', range);
          updatePrefs((p) => ({ ...p, loop: range, loopOn: true }));
          const bar = perf.bars[range.from];
          if (bar && player && !player.playing) seekTo(bar.start);
        }}
      />
      <FallingCanvas
        perf={perf}
        player={player}
        playing={playing}
        transpose={transpose}
        prefs={prefs}
        colours={colours}
        lanes={lanes ?? partLanes(perf)}
        hiddenLanes={hiddenLanes}
        mutedLanes={mutedLanes}
        onScrub={seekTo}
        onLookAhead={setLookAhead}
        userFingers={userFingers}
        suggested={suggested}
        chords={chords}
        handsOn={handsOn}
        fingerGuess={fingerGuess}
        selectedNote={picked?.key ?? null}
        onPick={pickNote}
        pickedLabel={picked?.label ?? null}
        expected={wait.expected}
        played={wait.played}
        onKeyDown={prefs.waitForMe ? wait.pressScreen : null}
        onKeyUp={wait.releaseScreen}
        overlay={
          prefs.waitForMe && (
            <WaitResult
              wait={wait}
              playing={playing}
              onAgain={() => {
                wait.reset();
                seekTo(waitLoopStart ?? 0);
              }}
            />
          )
        }
        marks={{
          history: fallingMarks.history,
          dispatch: fallingMarks.dispatch,
          tools: fallingDrawing.tools,
          selected: drawMode ? fallingDrawing.selected : null,
          onSelect: fallingDrawing.setSelected,
          editable: drawMode && fallingMarks.load === 'ready',
          onClaim: () => {
            chooseDrawSurface('falling');
          },
        }}
      />
    </section>
  );
}
