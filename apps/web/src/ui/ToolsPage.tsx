import { MetronomePanel } from '../metronome/MetronomePanel.tsx';
import { TunerPanel } from '../tuner/TunerPanel.tsx';
import '../piece/piece.css';

export function ToolsPage() {
  return (
    <div className="tools-page">
      <h1>Tools</h1>
      <section className="card panel stack">
        <h2>⏱ Metronome</h2>
        <MetronomePanel />
        <p className="muted">
          <kbd>Space</kbd> starts and stops it on a score page; <kbd>+</kbd>/<kbd>−</kbd> nudge the
          tempo.
        </p>
      </section>
      <section className="card panel stack">
        <h2>🎤 Tuner</h2>
        <TunerPanel />
      </section>
    </div>
  );
}
