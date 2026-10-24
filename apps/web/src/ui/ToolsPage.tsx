import { MetronomePanel } from '../metronome/MetronomePanel.tsx';
import { TunerPanel } from '../tuner/TunerPanel.tsx';
import '../piece/piece.css';
import { strings } from '../strings.ts';

export function ToolsPage() {
  return (
    <div className="tools-page">
      <h1>{strings.tools.title}</h1>
      <section className="card panel stack">
        <h2>{strings.tools.metronome}</h2>
        <MetronomePanel />
        <p className="muted">{strings.tools.metronomeHint}</p>
      </section>
      <section className="card panel stack">
        <h2>{strings.tools.tuner}</h2>
        <TunerPanel />
      </section>
    </div>
  );
}
