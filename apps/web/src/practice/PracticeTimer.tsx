import type { PracticeSession } from '@pcaa/shared';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { useMetronome } from '../metronome/MetronomeProvider.tsx';
import { rememberTimer, savedTimer } from '../resume/resume.ts';
import {
  elapsedMs,
  formatDuration,
  idleTimer,
  pauseTimer,
  startTimer,
  type TimerState,
} from './timer.ts';
import './practice.css';

interface Props {
  pieceId: string;
  onLogged: (session: PracticeSession) => void;
}

export function PracticeTimer({ pieceId, onLogged }: Props) {
  const metronome = useMetronome();
  const [timer, setTimer] = useState<TimerState>(() => {
    const spot = savedTimer(pieceId);
    return spot
      ? { runningSince: null, accumulatedMs: spot.accumulatedMs, startedAt: spot.startedAt }
      : idleTimer();
  });
  const [now, setNow] = useState(() => Date.now());
  const [logging, setLogging] = useState(false);
  const [bpm, setBpm] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const running = timer.runningSince !== null;

  const [initialTimer] = useState(timer);
  const lastWritten = useRef<string | null>(null);
  const remember = useEffectEvent(() => {
    if (timer === initialTimer) return;
    const accumulatedMs = elapsedMs(timer, Date.now());
    const spot =
      timer.startedAt === null || accumulatedMs <= 0
        ? null
        : { accumulatedMs: Math.round(accumulatedMs / 1000) * 1000, startedAt: timer.startedAt };
    const fingerprint = JSON.stringify(spot);
    if (fingerprint === lastWritten.current) return;
    lastWritten.current = fingerprint;
    rememberTimer(pieceId, spot);
  });

  useEffect(() => {
    remember();
  }, [timer]);

  useEffect(() => {
    const onHide = () => {
      remember();
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      remember();
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      remember();
    }, 5000);
    return () => {
      window.clearInterval(id);
    };
  }, [running]);
  const elapsed = elapsedMs(timer, now);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(id);
    };
  }, [running]);

  const finish = () => {
    const at = Date.now();
    setTimer((t) => pauseTimer(t, at));
    setNow(at);
    setBpm(String(metronome.settings.bpm));
    setLogging(true);
  };

  const save = async () => {
    if (timer.startedAt === null) return;
    const durationSec = Math.max(1, Math.round(elapsed / 1000));
    const parsedBpm = bpm.trim() === '' ? null : Math.round(Number(bpm));
    try {
      const session = await api.addSession({
        pieceId: pieceId as PracticeSession['pieceId'],
        startedAt: new Date(timer.startedAt).toISOString(),
        durationSec,
        bpm: parsedBpm !== null && Number.isFinite(parsedBpm) ? parsedBpm : null,
        note: note.trim(),
      });
      console.info('dewidebug practice session logged', { pieceId, durationSec, bpm: session.bpm });
      onLogged(session);
      setTimer(idleTimer());
      setLogging(false);
      setNote('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="practice-timer" aria-label="Practice timer">
      <div className="row">
        <span className={`clock${running ? ' running' : ''}`} data-testid="practice-clock">
          {formatDuration(elapsed)}
        </span>
        <div className="spacer" />
        {!logging && (
          <button
            type="button"
            className={`btn ${running ? 'sun' : 'teal'}`}
            data-testid="practice-start"
            onClick={() => {
              const at = Date.now();
              setTimer((t) => (running ? pauseTimer(t, at) : startTimer(t, at)));
              setNow(at);
            }}
          >
            {running ? '❚❚ Pause' : timer.startedAt === null ? '▶ Practise' : '▶ Resume'}
          </button>
        )}
        {!logging && timer.startedAt !== null && (
          <button
            type="button"
            className="btn primary"
            onClick={finish}
            data-testid="practice-finish"
          >
            ✓ Done
          </button>
        )}
      </div>
      {logging && (
        <form
          className="stack log-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="field">
            Top clean tempo (bpm, optional)
            <input
              className="input"
              inputMode="numeric"
              value={bpm}
              onChange={(e) => {
                setBpm(e.target.value);
              }}
              data-testid="practice-bpm"
            />
          </label>
          <label className="field">
            Note
            <input
              className="input"
              value={note}
              placeholder="What went well? What next?"
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit" className="btn primary" data-testid="practice-save">
              Log {formatDuration(elapsed)}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setLogging(false);
              }}
            >
              Keep going
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setTimer(idleTimer());
                setLogging(false);
              }}
            >
              Discard
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
