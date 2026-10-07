import { useState } from 'react';
import { hzToNote, nearestString, noteLabel, TUNINGS } from './notes.ts';
import { useTuner } from './use-tuner.ts';
import './tuner.css';

const IN_TUNE_CENTS = 5;

function Needle({ cents }: { cents: number | null }) {
  const clamped = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const angle = (clamped / 50) * 60;
  const inTune = cents !== null && Math.abs(cents) <= IN_TUNE_CENTS;
  return (
    <svg viewBox="0 0 200 120" className="needle" aria-hidden="true">
      <path
        d="M20 110 A80 80 0 0 1 180 110"
        fill="none"
        stroke="var(--line)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path d="M93 32 A80 80 0 0 1 107 32" fill="none" stroke="var(--teal)" strokeWidth="14" />
      {[-50, -25, 0, 25, 50].map((c) => {
        const a = ((c / 50) * 60 - 90) * (Math.PI / 180);
        return (
          <line
            key={c}
            x1={100 + 66 * Math.cos(a)}
            y1={110 + 66 * Math.sin(a)}
            x2={100 + 58 * Math.cos(a)}
            y2={110 + 58 * Math.sin(a)}
            stroke="var(--ink-soft)"
            strokeWidth="2"
          />
        );
      })}
      <g
        transform={`rotate(${String(angle)} 100 110)`}
        style={{ transition: 'transform 80ms linear' }}
      >
        <line
          x1="100"
          y1="110"
          x2="100"
          y2="34"
          stroke={inTune ? 'var(--ok)' : cents === null ? 'var(--line)' : 'var(--coral)'}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>
      <circle cx="100" cy="110" r="9" fill="var(--ink)" />
    </svg>
  );
}

export function TunerPanel() {
  const tuner = useTuner();
  const [tuningId, setTuningId] = useState('standard');
  const [a4, setA4] = useState(440);
  const tuning = TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0];
  const reading = tuner.hz === null ? null : hzToNote(tuner.hz, a4);
  const string = tuner.hz === null || !tuning ? null : nearestString(tuner.hz, tuning, a4);
  const inTune = reading !== null && Math.abs(reading.cents) <= IN_TUNE_CENTS;

  return (
    <section className="tuner" aria-label="Tuner">
      <div className="row">
        <button
          type="button"
          className={`btn ${tuner.listening ? 'coral' : 'teal'}`}
          onClick={tuner.listening ? tuner.stop : tuner.start}
          data-testid="tuner-toggle"
        >
          {tuner.listening ? '■ Stop listening' : '🎤 Start tuner'}
        </button>
        <div className="spacer" />
        <label className="row small-field">
          <span className="muted">A4</span>
          <input
            className="input mini"
            type="number"
            min={400}
            max={480}
            value={a4}
            onChange={(e) => {
              setA4(Number(e.target.value) || 440);
            }}
          />
        </label>
      </div>
      {tuner.error && <p className="error">{tuner.error}</p>}
      <div
        className={`tuner-readout${inTune ? ' in-tune' : ''}`}
        data-testid="tuner-readout"
        data-note={reading ? `${reading.name}${String(reading.octave)}` : ''}
        data-cents={reading?.cents ?? ''}
      >
        <Needle cents={reading?.cents ?? null} />
        <div className="note">
          {reading ? (
            <>
              <span className="note-name">{reading.name}</span>
              <span className="note-octave">{reading.octave}</span>
            </>
          ) : (
            <span className="note-name muted">{tuner.listening ? '…' : '–'}</span>
          )}
        </div>
        <div className="cents">
          {reading
            ? `${reading.cents > 0 ? '+' : ''}${reading.cents.toFixed(1)} cents · ${tuner.hz?.toFixed(1) ?? ''} Hz`
            : tuner.listening
              ? 'Play a string'
              : 'Not listening'}
        </div>
      </div>
      <label className="field">
        Tuning
        <select
          className="input"
          value={tuningId}
          onChange={(e) => {
            setTuningId(e.target.value);
          }}
        >
          {TUNINGS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="strings" aria-label="Strings">
        {tuning?.strings.map((midi, i) => (
          <span
            key={midi * 10 + i}
            className={`string${string?.index === i ? (Math.abs(string.cents) <= IN_TUNE_CENTS ? ' hit ok' : ' hit') : ''}`}
          >
            {noteLabel(midi)}
          </span>
        ))}
      </div>
    </section>
  );
}
