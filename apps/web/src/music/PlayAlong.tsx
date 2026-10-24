import {
  MAX_TRANSPOSE,
  PLAY_ALONG_MAX_SPEED,
  PLAY_ALONG_MIN_SPEED,
  RAMP_STEP,
  RAMP_TARGET,
  type MusicRef,
  type PlayAlongPrefs,
} from '@pcaa/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { isTypingTarget } from '../annotate/tools.ts';
import { rememberPlayAlong, savedPlayAlong, scoreKey } from '../resume/resume.ts';
import { useAsync } from '../ui/use-async.ts';
import { staffColours } from './colours.ts';
import { drawFalling, geometry } from './falling.ts';
import { capoFor, fitRange, keyName, signedSemitones, transposeFifths } from './keys.ts';
import { BarStrip } from './BarStrip.tsx';
import { loadScore } from './load.ts';
import { barAt, buildPerformance, type Performance } from './performance.ts';
import { PianoPlayer, type PlayerEvent } from './player.ts';
import './music.css';

const SPEED_STEP = 0.05;

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

function usePerformance(pieceId: string, file: string) {
  return useAsync(async () => {
    const res = await fetch(api.fileUrl(pieceId, file), { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Could not fetch ${file}: ${String(res.status)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const started = window.performance.now();
    const score = loadScore(bytes);
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
    return perf;
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
  const loop = useMemo(() => {
    if (!prefs.loop) return null;
    const from = perf.bars[prefs.loop.from];
    const to = perf.bars[prefs.loop.to];
    return from && to ? { start: from.start, end: to.end } : null;
  }, [perf, prefs.loop]);
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
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
  }, [perf, player, playing, transpose, range, hidden, muted, colours, loop, size, prefs.position]);

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
  const perf = loaded.data;
  const key = scoreKey(pieceId, music.file);
  const [prefs, setPrefs] = useState<PlayAlongPrefs>(() => savedPlayAlong(key));
  const [playing, setPlaying] = useState(false);
  const [samples, setSamples] = useState<string | null>(null);
  const [barIndex, setBarIndex] = useState(0);
  const readout = useRef<HTMLSpanElement>(null);
  const transpose = music.transpose;
  const colours = useMemo(() => (perf ? staffColours(perf.staves) : []), [perf]);

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
          if (!p.ramp || p.speed >= RAMP_TARGET) return p;
          const speed = Math.min(RAMP_TARGET, Math.round((p.speed + RAMP_STEP) * 100) / 100);
          console.info('dewidebug play-along loop speed-up', { from: p.speed, to: speed });
          return { ...p, speed };
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
    const hidden = new Set(prefs.hidden);
    const muted = new Set(prefs.muted);
    player.setInclude((n) => !hidden.has(n.staff) && !muted.has(n.staff));
  }, [player, perf, prefs.hidden, prefs.muted]);

  useEffect(() => {
    if (!player || !perf) return;
    const from = prefs.loop ? perf.bars[prefs.loop.from] : undefined;
    const to = prefs.loop ? perf.bars[prefs.loop.to] : undefined;
    player.setLoop(from && to ? { start: from.start, end: to.end } : null);
  }, [player, perf, prefs.loop]);

  useEffect(() => {
    player?.setTranspose(transpose);
  }, [player, transpose]);

  useEffect(() => {
    player?.setSpeed(prefs.speed);
  }, [player, prefs.speed]);

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
    if (player.playing) {
      player.pause();
      updatePrefs((p) => ({ ...p, position: player.position() }));
    } else {
      player.play().catch((error: unknown) => {
        console.warn('dewidebug play-along could not start audio', { error: String(error) });
      });
    }
  }, [player, updatePrefs]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!player || !perf) return;
      const target = Math.min(Math.max(0, seconds), perf.duration);
      player.seek(target);
      if (!player.playing) updatePrefs((p) => ({ ...p, position: target }));
    },
    [player, perf, updatePrefs],
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
      const clamped =
        Math.round(Math.min(PLAY_ALONG_MAX_SPEED, Math.max(PLAY_ALONG_MIN_SPEED, speed)) * 100) /
        100;
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
    <section className="playalong" aria-label="Play-along" data-testid="playalong">
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
            const from = prefs.loop ? perf.bars[prefs.loop.from] : undefined;
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
        <span className="playalong-field" data-testid="playalong-loop">
          <span>Loop</span>
          <strong>{loopLabel}</strong>
          <button
            type="button"
            className="btn small ghost"
            title="Start the loop at the current bar"
            onClick={() => {
              const at = currentBar();
              updatePrefs((p) => ({
                ...p,
                loop: { from: at, to: p.loop && p.loop.to >= at ? p.loop.to : at },
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
        {samples && <span className="muted small-print">{samples}</span>}
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
      <BarStrip
        bars={perf.bars}
        current={barIndex}
        loop={prefs.loop}
        onSeek={(index) => {
          const bar = perf.bars[index];
          if (bar) seekTo(bar.start);
        }}
        onLoop={(range) => {
          console.info('dewidebug play-along loop chosen on the bar strip', range);
          updatePrefs((p) => ({ ...p, loop: range }));
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
