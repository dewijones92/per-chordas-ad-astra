import {
  MAX_TRANSPOSE,
  PLAY_ALONG_MAX_SPEED,
  PLAY_ALONG_MIN_SPEED,
  RAMP_STEP,
  RAMP_TARGET,
  newId,
  type HardBit,
  type MusicRef,
  type PlayAlongPrefs,
} from '@pcaa/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { DrawingStatus } from '../annotate/DrawingStatus.tsx';
import { Toolbar } from '../annotate/Toolbar.tsx';
import { isTypingTarget } from '../annotate/tools.ts';
import { useAnnotations } from '../annotate/use-annotations.ts';
import { claimDrawing, useDrawing } from '../annotate/use-drawing.ts';
import { useRememberedZoom } from '../score/use-remembered-zoom.ts';
import { strings } from '../strings.ts';
import { LoopSwitch } from '../ui/LoopSwitch.tsx';
import { rememberPlayAlong, savedPlayAlong, scoreKey } from '../resume/resume.ts';
import { useAsync } from '../ui/use-async.ts';
import { staffColours } from './colours.ts';
import { drawFalling, geometry } from './falling.ts';
import { capoFor, fitRange, keyName, signedSemitones, transposeFifths } from './keys.ts';
import { BarStrip } from './BarStrip.tsx';
import { parseScoreText, unpackScore } from './load.ts';
import { DRAW_MIN_ZOOM, Notation } from './Notation.tsx';
import { toMusicXml } from './to-musicxml.ts';
import { download, exportName, performanceToMidi, transposeMusicXml } from './export.ts';
import { barAt, buildPerformance, type Performance } from './performance.ts';
import { PianoPlayer, type PlayerEvent } from './player.ts';
import { PlayAlongLog } from './practice-session.ts';
import { clampSpeed } from './transport.ts';
import './music.css';

const SPEED_STEP = 0.05;

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
  return from === undefined || to === undefined ? null : `bars ${String(from)}–${String(to)}`;
}

function usePerformance(pieceId: string, file: string) {
  return useAsync(async () => {
    const res = await fetch(api.fileUrl(pieceId, file), { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Could not fetch ${file}: ${String(res.status)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const started = window.performance.now();
    const text = unpackScore(bytes);
    const score = parseScoreText(text);
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
  onScrub,
}: {
  perf: Performance;
  player: PianoPlayer | null;
  playing: boolean;
  transpose: number;
  prefs: PlayAlongPrefs;
  colours: ReturnType<typeof staffColours>;
  onScrub: (seconds: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
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
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const names = useMemo(
    () => (prefs.names ? { flats: transposeFifths(perf.keyFifths, transpose) < 0 } : null),
    [prefs.names, perf.keyFifths, transpose],
  );
  const muted = useMemo(() => new Set(prefs.muted), [prefs.muted]);

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
    const draw = () => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const position = player?.position() ?? prefs.position;
      drawFalling(ctx, {
        perf,
        position,
        transpose,
        range,
        hidden,
        muted,
        colours,
        loop,
        names,
        width: size.width,
        height: size.height,
      });
      el.dataset['position'] = position.toFixed(3);
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
    loop,
    names,
    size,
    prefs.position,
  ]);

  const drag = useRef<{ y: number; position: number } | null>(null);
  const pxPerSecond = geometry({ width: size.width, height: size.height, range }).pxPerSecond;

  return (
    <div className="playalong-stage">
      <canvas
        ref={canvas}
        className="playalong-canvas"
        data-testid="playalong-canvas"
        style={{ width: `${String(size.width)}px`, height: `${String(size.height)}px` }}
        onWheel={(e) => {
          const position = player?.position() ?? prefs.position;
          onScrub(position - e.deltaY / Math.max(1, pxPerSecond));
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, position: player?.position() ?? prefs.position };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          onScrub(drag.current.position + (e.clientY - drag.current.y) / Math.max(1, pxPerSecond));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
    </div>
  );
}

export function PlayAlong({
  pieceId,
  music,
  spaceToggles,
  onTranspose,
}: {
  pieceId: string;
  music: MusicRef;
  spaceToggles: boolean;
  onTranspose: (semitones: number) => void;
}) {
  const loaded = usePerformance(pieceId, music.file);
  const perf = loaded.data?.perf;
  const key = scoreKey(pieceId, music.file);
  const [prefs, setPrefs] = useState<PlayAlongPrefs>(() => savedPlayAlong(key));
  const [playing, setPlaying] = useState(false);
  const [samples, setSamples] = useState<string | null>(null);
  const [barIndex, setBarIndex] = useState(0);
  const [drawMode, setDrawMode] = useState(false);
  const [notationZoom, setNotationZoom] = useRememberedZoom(key);
  const notationMarks = useAnnotations(pieceId, music.file);
  const drawing = useDrawing('notation', notationMarks.history, notationMarks.dispatch, drawMode);
  useEffect(() => {
    if (!drawMode) return;
    claimDrawing('notation');
    return () => {
      claimDrawing(null);
    };
  }, [drawMode]);
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
  const colours = useMemo(() => (perf ? staffColours(perf.staves) : []), [perf]);
  const sourceXml = useMemo(() => {
    const data = loaded.data;
    if (!data) return null;
    if (data.score.format === 'musicxml') return data.text;
    return data.score.notation ? toMusicXml(data.score, data.score.notation) : null;
  }, [loaded.data]);
  const notationXml = prefs.notation ? sourceXml : null;

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

  const player = useMemo(() => {
    if (!perf) return null;
    const onEvent = (event: PlayerEvent) => {
      if (event.kind === 'state') setPlaying(event.playing);
      if (event.kind === 'samples') {
        setSamples(
          event.error
            ? 'Piano sound unavailable; using a simple synth'
            : event.loaded < event.total
              ? `Piano ${String(event.loaded)}/${String(event.total)}`
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

  useEffect(() => {
    if (!player || !perf) return;
    const muted = new Set(prefs.muted);
    player.setInclude((n) => !muted.has(n.staff));
  }, [player, perf, prefs.muted]);

  const applied = activeLoop(prefs);
  const loopFrom = applied?.from ?? null;
  const loopTo = applied?.to ?? null;
  useEffect(() => {
    if (!player || !perf) return;
    const from = loopFrom === null ? undefined : perf.bars[loopFrom];
    const to = loopTo === null ? undefined : perf.bars[loopTo];
    console.info('dewidebug play-along loop applied', { from: loopFrom, to: loopTo });
    player.setLoop(from && to ? { start: from.start, end: to.end } : null);
  }, [player, perf, loopFrom, loopTo]);

  useEffect(() => {
    player?.setTranspose(transpose);
  }, [player, transpose]);

  useEffect(() => {
    player?.setSpeed(prefs.speed);
  }, [player, prefs.speed]);

  useEffect(() => {
    player?.setRamp(prefs.ramp ? { step: RAMP_STEP, target: RAMP_TARGET } : null);
  }, [player, prefs.ramp]);

  useEffect(() => {
    player?.setClick(prefs.click);
  }, [player, prefs.click]);

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
      saveBits(bits.map((b) => (b.id === bit.id ? { ...b, bestSpeed: speed } : b)));
    });
  }, [player, loopNow, bits, saveBits]);

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
        readout.current.textContent = `Bar ${String(bar?.number ?? 1)} · ${clock(position)} / ${clock(perf.duration)}`;
      }
      if (player.playing) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [player, perf, playing]);

  const toggle = useCallback(() => {
    if (!player) return;
    if (player.playing || player.starting) {
      player.pause();
      updatePrefs((p) => ({ ...p, position: player.position() }));
    } else {
      setDrawMode(false);
      player.play(prefs.countIn).catch((error: unknown) => {
        console.warn('dewidebug play-along could not start audio', { error: String(error) });
      });
    }
  }, [player, updatePrefs, prefs.countIn]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!player || !perf) return;
      const target = Math.min(Math.max(0, seconds), perf.duration);
      player.seek(target);
      if (!player.playing) updatePrefs((p) => ({ ...p, position: target }));
    },
    [player, perf, updatePrefs],
  );

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
      const clamped = Math.round(clampSpeed(speed) * 100) / 100;
      updatePrefs((p) => ({ ...p, speed: clamped }));
    },
    [updatePrefs],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'k' || (spaceToggles && e.key === ' ')) {
        e.preventDefault();
        toggle();
      } else if (e.key === '[') {
        setSpeed(prefs.speed - SPEED_STEP);
      } else if (e.key === ']') {
        setSpeed(prefs.speed + SPEED_STEP);
      } else if (e.key === ',') {
        stepBar(-1);
      } else if (e.key === '.') {
        stepBar(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [toggle, setSpeed, stepBar, prefs.speed, spaceToggles]);

  if (loaded.error) {
    return (
      <section className="playalong" aria-label="Play-along">
        <p className="error" data-testid="playalong-error">
          Could not read {music.name}: {loaded.error}
        </p>
      </section>
    );
  }
  if (!perf) {
    return (
      <section className="playalong" aria-label="Play-along">
        <p className="muted playalong-loading">Reading {music.name}…</p>
      </section>
    );
  }

  const currentBar = () => (player ? barAt(perf, player.position() + 0.001) : 0);
  const writtenKey = keyName(perf.keyFifths, perf.keyMinor);
  const playedKey = keyName(transposeFifths(perf.keyFifths, transpose), perf.keyMinor);
  const capo = capoFor(transpose);
  const loopLabel = prefs.loop
    ? `Bars ${String(perf.bars[prefs.loop.from]?.number ?? '?')}–${String(perf.bars[prefs.loop.to]?.number ?? '?')}`
    : 'Off';

  return (
    <section
      className={`playalong${drawMode ? ' is-drawing' : ''}`}
      aria-label="Play-along"
      data-testid="playalong"
    >
      <div className="playalong-bar">
        <button
          type="button"
          className={`btn small ${playing ? 'coral' : 'primary'}`}
          data-testid="playalong-play"
          aria-pressed={playing}
          title="Play or pause (K)"
          onClick={toggle}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          type="button"
          className="btn small icon"
          aria-label="Back to the start"
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
          aria-label="Previous bar"
          title="Previous bar (,)"
          onClick={() => {
            stepBar(-1);
          }}
        >
          ‹
        </button>
        <button
          type="button"
          className="btn small icon"
          aria-label="Next bar"
          title="Next bar (.)"
          onClick={() => {
            stepBar(1);
          }}
        >
          ›
        </button>
        <span className="playalong-readout" ref={readout} data-testid="playalong-position" />
        <span className="spacer" />
        <label className="playalong-field" title="Speed ([ and ])">
          <span>Speed</span>
          <input
            type="range"
            min={PLAY_ALONG_MIN_SPEED * 100}
            max={PLAY_ALONG_MAX_SPEED * 100}
            step={SPEED_STEP * 100}
            value={Math.round(prefs.speed * 100)}
            aria-label="Play-along speed"
            onChange={(e) => {
              setSpeed(Number(e.target.value) / 100);
            }}
          />
          <strong data-testid="playalong-speed">{Math.round(prefs.speed * 100)}%</strong>
        </label>
      </div>
      <div className="playalong-bar">
        <span className="playalong-field" data-testid="playalong-transpose">
          <span>Key</span>
          <button
            type="button"
            className="btn small icon"
            aria-label="Transpose down a semitone"
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
                <span className="muted">written in</span> <strong>{writtenKey}</strong>
                <span aria-hidden="true">→</span> <span className="muted">now</span>{' '}
                <strong>{playedKey}</strong>
              </>
            )}{' '}
            <span className="muted">({signedSemitones(transpose)})</span>
          </span>
          <button
            type="button"
            className="btn small icon"
            aria-label="Transpose up a semitone"
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
              Reset
            </button>
          )}
          {capo !== null && (
            <span
              className="playalong-capo"
              data-testid="playalong-capo"
              title={`On guitar: capo on fret ${String(capo)} and play the written shapes to sound ${playedKey}`}
            >
              🎸 Capo {capo} + written shapes
            </span>
          )}
        </span>
        <span className="playalong-field" data-testid="playalong-export">
          <span>Export</span>
          <button
            type="button"
            className="btn small ghost"
            disabled={!sourceXml}
            title={`MusicXML in ${playedKey}, for MuseScore or any notation program`}
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
            💾 MusicXML
          </button>
          <button
            type="button"
            className="btn small ghost"
            title={`MIDI in ${playedKey}, repeats played out`}
            onClick={() => {
              download(
                exportName(music.name, transpose, 'mid'),
                performanceToMidi(perf, transpose),
                'audio/midi',
              );
            }}
          >
            💾 MIDI
          </button>
        </span>
        <span className="playalong-field" data-testid="playalong-loop">
          <LoopSwitch
            on={prefs.loopOn}
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
            title="Start the loop at the current bar"
            onClick={() => {
              const at = currentBar();
              updatePrefs((p) => ({
                ...p,
                loop: { from: at, to: p.loop && p.loop.to >= at ? p.loop.to : at },
                loopOn: true,
              }));
            }}
          >
            From here
          </button>
          <button
            type="button"
            className="btn small ghost"
            title="End the loop at the current bar"
            onClick={() => {
              const at = currentBar();
              updatePrefs((p) => ({
                ...p,
                loop: { from: p.loop && p.loop.from <= at ? p.loop.from : at, to: at },
                loopOn: true,
              }));
            }}
          >
            To here
          </button>
          {prefs.loop && (
            <button
              type="button"
              className="btn small ghost"
              aria-label="Clear the loop"
              onClick={() => {
                updatePrefs((p) => ({ ...p, loop: null }));
              }}
            >
              ✕
            </button>
          )}
        </span>
        <label
          className="playalong-field"
          title="Each time the loop comes round, play it 5% faster until full speed"
        >
          <input
            type="checkbox"
            checked={prefs.ramp}
            data-testid="playalong-ramp"
            onChange={(e) => {
              const ramp = e.target.checked;
              updatePrefs((p) => ({ ...p, ramp }));
            }}
          />
          Speed up each loop
        </label>
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
          All 88 keys
        </label>
        <label className="playalong-field" title="One bar of clicks before the music starts">
          <input
            type="checkbox"
            checked={prefs.countIn}
            data-testid="playalong-countin"
            onChange={(e) => {
              const countIn = e.target.checked;
              updatePrefs((p) => ({ ...p, countIn }));
            }}
          />
          🥁 Count-in
        </label>
        <label className="playalong-field" title="A metronome click on every beat while it plays">
          <input
            type="checkbox"
            checked={prefs.click}
            data-testid="playalong-click"
            onChange={(e) => {
              const click = e.target.checked;
              updatePrefs((p) => ({ ...p, click }));
            }}
          />
          Click
        </label>
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
          🎼 Notation
        </label>
        <button
          type="button"
          className="btn small ghost"
          data-testid="notation-draw"
          aria-pressed={drawMode}
          title={strings.notation.drawTitle}
          onClick={() => {
            if (drawMode) {
              console.info('dewidebug notation draw mode off');
              setDrawMode(false);
              return;
            }
            if (player?.playing || player?.starting) toggle();
            if (!prefs.notation) updatePrefs((p) => ({ ...p, notation: true }));
            console.info('dewidebug notation draw mode on', {
              file: music.file,
              zoom: notationZoom,
            });
            setNotationZoom((z) => Math.max(z, DRAW_MIN_ZOOM));
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
          Note names
        </label>
        {samples && <span className="muted small-print">{samples}</span>}
      </div>
      <div
        className="playalong-parts playalong-bits"
        aria-label="Hard bits"
        data-testid="hard-bits"
      >
        <span className="playalong-field">📌 Hard bits</span>
        {hardBits.error && !bitsLoaded && (
          <span className="error small-print" data-testid="hard-bits-error">
            Saved hard bits could not be loaded: {hardBits.error}{' '}
            <button type="button" className="btn small ghost" onClick={reloadHardBits}>
              Try again
            </button>
          </span>
        )}
        {bitsLoaded && bits.length === 0 && (
          <span className="muted small-print">
            Loop a passage, then save it here to come back to it.
          </span>
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
                title={`Loop bars ${String(b.fromBar)}–${String(b.toBar)}`}
                onClick={() => {
                  console.info('dewidebug hard bit chosen', {
                    name: b.name,
                    from: b.from,
                    to: b.to,
                  });
                  updatePrefs((p) => ({ ...p, loop: { from: b.from, to: b.to }, loopOn: true }));
                  const bar = perf.bars[b.from];
                  if (bar && player && !player.playing) seekTo(bar.start);
                }}
              >
                {b.name}
              </button>
              <span className="muted small-print" data-testid="hard-bit-best">
                best {Math.round(b.bestSpeed * 100)}%
              </span>
              <button
                type="button"
                className="btn small ghost icon part-toggle"
                aria-label={`Forget ${b.name}`}
                onClick={() => {
                  if (!window.confirm(`Forget the hard bit “${b.name}”?`)) return;
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
                  'Name this hard bit',
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
              📌 Save loop as hard bit
            </button>
          )}
      </div>
      <div className="playalong-parts" aria-label="Parts">
        {perf.staves.map((s) => {
          const colour = colours[s.index];
          const isHidden = prefs.hidden.includes(s.index);
          const isMuted = prefs.muted.includes(s.index);
          return (
            <span key={s.index} className="playalong-part" data-testid="playalong-part">
              <span className="playalong-swatch" style={{ background: colour?.fill }} />
              <span className={isHidden ? 'muted' : ''}>{s.name}</span>
              <button
                type="button"
                className="btn small ghost icon part-toggle"
                aria-label={`${isHidden ? 'Show' : 'Hide'} ${s.name}`}
                onClick={() => {
                  updatePrefs((p) => ({
                    ...p,
                    hidden: isHidden
                      ? p.hidden.filter((h) => h !== s.index)
                      : [...p.hidden, s.index],
                  }));
                }}
              >
                {isHidden ? '🙈' : '👁'}
              </button>
              <button
                type="button"
                className="btn small ghost icon part-toggle"
                aria-label={`${isMuted ? 'Unmute' : 'Mute'} ${s.name}`}
                onClick={() => {
                  updatePrefs((p) => ({
                    ...p,
                    muted: isMuted ? p.muted.filter((m) => m !== s.index) : [...p.muted, s.index],
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
            ⚠ {perf.warnings[0]}
            {perf.warnings.length > 1 ? ` (+${String(perf.warnings.length - 1)})` : ''}
          </span>
        )}
      </div>
      {drawMode && (
        <>
          <Toolbar
            {...drawing.toolbar}
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
                {strings.notation.done}
              </button>
            }
          />
          <DrawingStatus
            load={notationMarks.load}
            error={notationMarks.error}
            reload={notationMarks.reload}
          />
        </>
      )}
      {notationXml && loaded.data && (
        <Notation
          xml={notationXml}
          transpose={transpose}
          perf={perf}
          measures={loaded.data.score.measures}
          playing={playing}
          position={notationPosition}
          onSeek={seekTo}
          zoom={notationZoom}
          onZoom={setNotationZoom}
          drawing={drawMode}
          marks={{
            history: notationMarks.history,
            dispatch: notationMarks.dispatch,
            tools: drawing.tools,
            selected: drawing.selected,
            onSelect: drawing.setSelected,
            editable: notationMarks.load === 'ready',
          }}
        />
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
        onScrub={seekTo}
      />
    </section>
  );
}
