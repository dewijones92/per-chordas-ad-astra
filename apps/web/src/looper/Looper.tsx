import { newId, type Loop, type Loops, type TrackRef } from '@pcaa/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import {
  computePeaks,
  formatTime,
  normaliseLoop,
  shouldWrap,
  type LoopWindow,
} from './loop-math.ts';
import './looper.css';

const BUCKETS = 480;
const RATES = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.25];

interface Props {
  pieceId: string;
  tracks: readonly TrackRef[];
}

async function decodePeaks(url: string): Promise<Float32Array> {
  const bytes = await (await fetch(url)).arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 22_050);
  const audio = await ctx.decodeAudioData(bytes);
  console.info('dewidebug looper waveform decoded', { url, seconds: Math.round(audio.duration) });
  return computePeaks(audio.getChannelData(0), BUCKETS);
}

function usePeaks(url: string | null): Float32Array | null {
  const [result, setResult] = useState<{ url: string; peaks: Float32Array } | null>(null);
  useEffect(() => {
    if (!url) return;
    const state = { cancelled: false };
    decodePeaks(url).then(
      (peaks) => {
        if (!state.cancelled) setResult({ url, peaks });
      },
      (e: unknown) => {
        console.warn('dewidebug looper waveform decode failed', { url, error: String(e) });
      },
    );
    return () => {
      state.cancelled = true;
    };
  }, [url]);
  return result?.url === url ? result.peaks : null;
}

function Waveform({
  peaks,
  duration,
  position,
  loop,
  onSeek,
  onSelect,
}: {
  peaks: Float32Array | null;
  duration: number;
  position: number;
  loop: LoopWindow | null;
  onSeek: (sec: number) => void;
  onSelect: (a: number, b: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ startX: number; startSec: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!peaks) return;
    const bar = canvas.width / peaks.length;
    const mid = canvas.height / 2;
    ctx.fillStyle = '#6d3df2';
    peaks.forEach((p, i) => {
      const h = Math.max(1, p * (canvas.height - 4));
      ctx.fillRect(i * bar, mid - h / 2, Math.max(1, bar - 1), h);
    });
  }, [peaks]);

  const secAt = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return 0;
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  };

  const pct = (sec: number) => `${String(duration > 0 ? (sec / duration) * 100 : 0)}%`;

  return (
    <div
      className="waveform"
      data-testid="waveform"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startSec: secAt(e.clientX) };
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (Math.abs(e.clientX - d.startX) < 5) onSeek(d.startSec);
        else onSelect(d.startSec, secAt(e.clientX));
      }}
    >
      <canvas ref={canvasRef} />
      {loop && (
        <div
          className="loop-region"
          style={{ left: pct(loop.startSec), width: pct(loop.endSec - loop.startSec) }}
        />
      )}
      <div className="playhead" style={{ left: pct(position) }} />
      {!peaks && <span className="waveform-hint muted">Loading waveform…</span>}
    </div>
  );
}

export function Looper({ pieceId, tracks }: Props) {
  const [chosenTrack, setTrackFile] = useState<string | null>(tracks[0]?.file ?? null);
  const trackFile = tracks.some((t) => t.file === chosenTrack)
    ? chosenTrack
    : (tracks[0]?.file ?? null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<LoopWindow | null>(null);
  const [looping, setLooping] = useState(true);
  const [loops, setLoops] = useState<Loops>({ tracks: {} });
  const [mark, setMark] = useState<number | null>(null);
  const url = trackFile ? api.fileUrl(pieceId, trackFile) : null;
  const peaks = usePeaks(url);
  const wraps = useRef(0);

  useEffect(() => {
    api.getLoops(pieceId).then(setLoops, (e: unknown) => {
      console.warn('dewidebug looper could not load loops', { error: String(e) });
    });
  }, [pieceId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.preservesPitch = true;
    audio.playbackRate = rate;
  }, [rate, url]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        if (looping && shouldWrap(audio.currentTime, loop) && loop) {
          audio.currentTime = loop.startSec;
          wraps.current += 1;
        }
        setPosition(audio.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [playing, looping, loop]);

  if (tracks.length === 0 || !url || !trackFile) {
    return (
      <p className="muted">
        Add a backing track (MP3, M4A, OGG, WAV or FLAC) to slow it down and loop sections.
      </p>
    );
  }

  const audio = () => audioRef.current;
  const seek = (sec: number) => {
    const a = audio();
    if (a) a.currentTime = sec;
    setPosition(sec);
  };
  const toggle = () => {
    const a = audio();
    if (!a) return;
    if (a.paused) {
      if (looping && loop && (a.currentTime < loop.startSec || a.currentTime >= loop.endSec))
        a.currentTime = loop.startSec;
      void a.play();
    } else a.pause();
  };
  const savedLoops = loops.tracks[trackFile] ?? [];
  const persist = (next: Loop[]) => {
    const updated: Loops = { tracks: { ...loops.tracks, [trackFile]: next } };
    setLoops(updated);
    void api.putLoops(pieceId, updated).catch(() => undefined);
  };

  return (
    <section className="looper" aria-label="Slow-down looper">
      {tracks.length > 1 && (
        <select
          className="input"
          value={trackFile}
          onChange={(e) => {
            setTrackFile(e.target.value);
            setLoop(null);
          }}
        >
          {tracks.map((t) => (
            <option key={t.file} value={t.file}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        data-testid="looper-audio"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          e.currentTarget.preservesPitch = true;
          e.currentTarget.playbackRate = rate;
        }}
        onPlay={() => {
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
        }}
        onEnded={() => {
          setPlaying(false);
        }}
      />
      <Waveform
        peaks={peaks}
        duration={duration}
        position={position}
        loop={loop}
        onSeek={seek}
        onSelect={(a, b) => {
          setLoop(normaliseLoop(a, b, duration));
        }}
      />
      <div className="row">
        <button
          type="button"
          className={`btn ${playing ? 'coral' : 'primary'}`}
          onClick={toggle}
          data-testid="looper-play"
        >
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="time" data-testid="looper-time">
          {formatTime(position)} / {formatTime(duration)}
        </span>
        <div className="spacer" />
        <label className="row small-field">
          <span className="muted">Speed</span>
          <select
            className="input mini"
            value={rate}
            onChange={(e) => {
              setRate(Number(e.target.value));
            }}
            data-testid="looper-rate"
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {Math.round(r * 100)}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn small sun"
          title="Mark the loop start here, then press again at the end"
          onClick={() => {
            if (mark === null) setMark(position);
            else {
              setLoop(normaliseLoop(mark, position, duration));
              setMark(null);
            }
          }}
          data-testid="looper-mark"
        >
          {mark === null ? 'A ◆ set start' : 'B ◆ set end'}
        </button>
        <label className="row small-field">
          <input
            type="checkbox"
            checked={looping}
            onChange={(e) => {
              setLooping(e.target.checked);
            }}
          />
          <span>Loop</span>
        </label>
        {loop && (
          <>
            <span className="muted" data-testid="looper-loop">
              {formatTime(loop.startSec)} → {formatTime(loop.endSec)}
            </span>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                const name = window.prompt(
                  'Name this loop',
                  `Loop ${String(savedLoops.length + 1)}`,
                );
                if (!name) return;
                persist([
                  ...savedLoops,
                  { id: newId(), name, startSec: loop.startSec, endSec: loop.endSec, rate },
                ]);
              }}
              data-testid="looper-save"
            >
              Save loop
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                setLoop(null);
              }}
            >
              Clear
            </button>
          </>
        )}
      </div>
      {savedLoops.length > 0 && (
        <ul className="saved-loops">
          {savedLoops.map((l) => (
            <li key={l.id} className="row">
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setLoop({ startSec: l.startSec, endSec: l.endSec });
                  setRate(l.rate);
                  seek(l.startSec);
                }}
              >
                ↻ {l.name}
              </button>
              <span className="muted">
                {formatTime(l.startSec)}–{formatTime(l.endSec)} · {Math.round(l.rate * 100)}%
              </span>
              <span className="spacer" />
              <button
                type="button"
                className="btn small ghost"
                aria-label={`Delete loop ${l.name}`}
                onClick={() => {
                  persist(savedLoops.filter((x) => x.id !== l.id));
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
