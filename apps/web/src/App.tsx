import { useEffect, useRef, useState } from 'react';
import { Link, Route, Switch, useLocation, useRoute } from 'wouter';
import { LibraryPage } from './library/LibraryPage.tsx';
import { MetronomeProvider, useMetronome } from './metronome/MetronomeProvider.tsx';
import { PiecePage } from './piece/PiecePage.tsx';
import { LogPage } from './practice/LogPage.tsx';
import {
  flushResume,
  pullResume,
  readResume,
  rememberPath,
  shouldResumeTo,
} from './resume/resume.ts';
import { SyncPill } from './sync/SyncPill.tsx';
import { ToolsPage } from './ui/ToolsPage.tsx';
import './ui/shell.css';
import { names, strings, tips } from './strings.ts';

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
      title={tips.nav.stopMetronome}
    >
      <span className={`mini-beat${m.tick?.beat === 0 ? ' accent' : ''}`} key={m.played} />
      {strings.nav.metronomeRunning(m.tick?.bpm ?? m.settings.bpm)}
    </button>
  );
}

function useResumeReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void pullResume().finally(() => {
      setReady(true);
    });
    const onHide = () => {
      flushResume();
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
    };
  }, []);
  return ready;
}

function ResumeTracker() {
  const [location, navigate] = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      const target = shouldResumeTo(location, readResume());
      console.info('dewidebug resume on open', { at: location, target });
      if (target) {
        navigate(target, { replace: true });
        return;
      }
    }
    rememberPath(location);
  }, [location, navigate]);
  return null;
}

export function App() {
  const ready = useResumeReady();
  return (
    <MetronomeProvider>
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brand" aria-label={tips.nav.brand}>
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
              {names.app.first} <em>{names.app.second}</em>
            </span>
          </Link>
          <nav className="nav">
            <NavLink href="/">{strings.nav.library}</NavLink>
            <NavLink href="/log">{strings.common.practiceLog}</NavLink>
            <NavLink href="/tools">{strings.nav.tools}</NavLink>
          </nav>
          <span className="spacer" />
          <MiniMetronome />
          <SyncPill />
        </header>
        <main className="content">
          {!ready && <p className="muted boot">{strings.nav.finding}</p>}
          {ready && <ResumeTracker />}
          {ready && (
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
                  <h1>{strings.nav.lost}</h1>
                  <Link href="/">{strings.nav.backToLibrary}</Link>
                </div>
              </Route>
            </Switch>
          )}
        </main>
      </div>
    </MetronomeProvider>
  );
}
