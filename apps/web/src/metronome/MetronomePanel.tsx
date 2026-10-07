import { MAX_BPM, MIN_BPM, type Subdivision } from './scheduler.ts';
import { useMetronome } from './MetronomeProvider.tsx';
import './metronome.css';

const SUBDIVISIONS: { value: Subdivision; label: string; title: string }[] = [
  { value: 1, label: '♩', title: 'Quarter notes' },
  { value: 2, label: '♫', title: 'Eighth notes' },
  { value: 3, label: '3', title: 'Triplets' },
  { value: 4, label: '♬', title: 'Sixteenth notes' },
];

export function MetronomePanel({ compact = false }: { compact?: boolean }) {
  const m = useMetronome();
  const { settings } = m;
  const beats = Array.from({ length: settings.beatsPerBar }, (_, i) => i);
  const activeBeat = m.running && m.tick ? m.tick.beat : -1;
  const liveBpm = m.running && m.tick ? m.tick.bpm : settings.bpm;

  return (
    <section className={`metronome${compact ? ' compact' : ''}`} aria-label="Metronome">
      <div className="metro-top">
        <button
          type="button"
          className="btn icon small"
          aria-label="Slower"
          onClick={() => {
            m.setBpm(settings.bpm - 1);
          }}
        >
          −
        </button>
        <div className="bpm" data-testid="metronome-bpm">
          <span className="bpm-number">{liveBpm}</span>
          <span className="bpm-unit">bpm</span>
        </div>
        <button
          type="button"
          className="btn icon small"
          aria-label="Faster"
          onClick={() => {
            m.setBpm(settings.bpm + 1);
          }}
        >
          +
        </button>
        <div className="spacer" />
        <button
          type="button"
          className={`btn ${m.running ? 'coral' : 'primary'} play`}
          onClick={m.toggle}
          aria-pressed={m.running}
          data-testid="metronome-toggle"
        >
          {m.running ? '■ Stop' : '▶ Start'}
        </button>
      </div>

      <input
        type="range"
        min={MIN_BPM}
        max={300}
        value={settings.bpm}
        aria-label="Tempo"
        onChange={(e) => {
          m.setBpm(Number(e.target.value));
        }}
        className="tempo-slider"
      />

      <div className="beats" data-testid="metronome-beats" data-played={m.played}>
        {beats.map((b) => (
          <span
            key={b}
            className={`beat${b === 0 && settings.accentFirstBeat ? ' accent' : ''}${b === activeBeat ? ' on' : ''}`}
          />
        ))}
      </div>

      <div className="row">
        <button type="button" className="btn small sun" onClick={m.tap} title="Tap at least twice">
          Tap
        </button>
        <label className="row small-field">
          <span className="muted">Beats</span>
          <select
            className="input mini"
            value={settings.beatsPerBar}
            onChange={(e) => {
              m.update({ beatsPerBar: Number(e.target.value) });
            }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="row tight" role="group" aria-label="Subdivision">
          {SUBDIVISIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              className="btn small icon"
              title={s.title}
              aria-label={s.title}
              aria-pressed={settings.subdivision === s.value}
              onClick={() => {
                m.update({ subdivision: s.value });
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="row small-field">
          <input
            type="checkbox"
            checked={settings.accentFirstBeat}
            onChange={(e) => {
              m.update({ accentFirstBeat: e.target.checked });
            }}
          />
          <span>Accent 1</span>
        </label>
      </div>

      {!compact && (
        <details className="trainer" open={settings.trainer.enabled}>
          <summary>
            <label
              className="row small-field"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <input
                type="checkbox"
                checked={settings.trainer.enabled}
                onChange={(e) => {
                  m.update({ trainer: { ...settings.trainer, enabled: e.target.checked } });
                }}
              />
              <span>Speed trainer</span>
            </label>
          </summary>
          <div className="row trainer-fields">
            <label className="field">
              +bpm
              <input
                className="input mini"
                type="number"
                min={1}
                max={40}
                value={settings.trainer.stepBpm}
                onChange={(e) => {
                  m.update({
                    trainer: { ...settings.trainer, stepBpm: Number(e.target.value) || 1 },
                  });
                }}
              />
            </label>
            <label className="field">
              every bars
              <input
                className="input mini"
                type="number"
                min={1}
                max={64}
                value={settings.trainer.everyBars}
                onChange={(e) => {
                  m.update({
                    trainer: { ...settings.trainer, everyBars: Number(e.target.value) || 1 },
                  });
                }}
              />
            </label>
            <label className="field">
              up to
              <input
                className="input mini"
                type="number"
                min={MIN_BPM}
                max={MAX_BPM}
                value={settings.trainer.maxBpm}
                onChange={(e) => {
                  m.update({
                    trainer: {
                      ...settings.trainer,
                      maxBpm: Number(e.target.value) || settings.bpm,
                    },
                  });
                }}
              />
            </label>
          </div>
        </details>
      )}
    </section>
  );
}
