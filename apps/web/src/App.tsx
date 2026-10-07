import { Link, Route, Switch, useRoute } from 'wouter';
import { LibraryPage } from './library/LibraryPage.tsx';
import { MetronomeProvider, useMetronome } from './metronome/MetronomeProvider.tsx';
import { PiecePage } from './piece/PiecePage.tsx';
import { LogPage } from './practice/LogPage.tsx';
import { SyncPill } from './sync/SyncPill.tsx';
import { ToolsPage } from './ui/ToolsPage.tsx';
import './ui/shell.css';

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [active] = useRoute(href === '/' ? '/' : `${href}/*?`);
  return (
    <Link href={href} className={`nav-link${active ? ' on' : ''}`}>
      {children}
    </Link>
  );
}

function MiniMetronome() {
  const m = useMetronome();
  if (!m.running) return null;
  return (
    <button
      type="button"
      className="btn small coral mini-metro"
      onClick={m.toggle}
      title="Stop metronome"
    >
      <span className={`mini-beat${m.tick?.beat === 0 ? ' accent' : ''}`} key={m.played} />
      {m.tick?.bpm ?? m.settings.bpm} bpm ■
    </button>
  );
}

export function App() {
  return (
    <MetronomeProvider>
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brand" aria-label="Per chordas ad astra: library">
            <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
              <rect width="64" height="64" rx="14" fill="#6d3df2" />
              <path
                d="M32 9l6.6 14.2 15.4 1.8-11.4 10.6 3.1 15.3L32 43.2l-13.7 7.7 3.1-15.3L10 25l15.4-1.8z"
                fill="#ffc53d"
                stroke="#1d1533"
                strokeWidth="3"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              per chordas <em>ad astra</em>
            </span>
          </Link>
          <nav className="nav">
            <NavLink href="/">Library</NavLink>
            <NavLink href="/log">Practice log</NavLink>
            <NavLink href="/tools">Metronome &amp; tuner</NavLink>
          </nav>
          <span className="spacer" />
          <MiniMetronome />
          <SyncPill />
        </header>
        <main className="content">
          <Switch>
            <Route path="/">
              <LibraryPage />
            </Route>
            <Route path="/piece/:id">
              {(params) => <PiecePage key={params.id} id={params.id} />}
            </Route>
            <Route path="/log">
              <LogPage />
            </Route>
            <Route path="/tools">
              <ToolsPage />
            </Route>
            <Route>
              <div className="piece-missing">
                <h1>Lost in space 🌌</h1>
                <Link href="/">Back to the library</Link>
              </div>
            </Route>
          </Switch>
        </main>
      </div>
    </MetronomeProvider>
  );
}
