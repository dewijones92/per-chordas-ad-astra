import { useEffect } from 'react';
import { Link } from 'wouter';
import { api } from '../api/client.ts';
import { saves } from '../sync/saves.ts';
import { useAsync } from '../ui/use-async.ts';
import { localDay, streakDays, totalMinutesSince, totalsByDay, weekStart } from './stats.ts';
import { formatMinutes } from './timer.ts';
import './practice.css';
import { strings, tips } from '../strings.ts';

const DAYS_SHOWN = 28;

export function LogPage() {
  const sessions = useAsync(() => api.listSessions(), 'sessions');
  const pieces = useAsync(() => api.listPieces(), 'pieces');
  const { reload } = sessions;
  useEffect(
    () =>
      saves.subscribe(() => {
        if (saves.getSnapshot().inFlight === 0) {
          console.info('dewidebug log page: saves settled, reloading sessions');
          reload();
        }
      }),
    [reload],
  );
  if (sessions.error) return <p className="error log-page">{sessions.error}</p>;
  if (!sessions.data || !pieces.data)
    return <p className="muted log-page">{strings.common.loading}</p>;

  const all = sessions.data;
  const titles = new Map(pieces.data.map((p) => [p.id as string, p.title]));
  const now = new Date();
  const today = localDay(now.toISOString());
  const totals = new Map(totalsByDay(all).map((t) => [t.day, t]));
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (DAYS_SHOWN - 1 - i));
    const day = localDay(d.toISOString());
    return { day, minutes: totals.get(day)?.minutes ?? 0 };
  });
  const peak = Math.max(30, ...days.map((d) => d.minutes));
  const weekMinutes = totalMinutesSince(all, weekStart(now.toISOString()));
  const recent = [...all].reverse().slice(0, 50);

  return (
    <div className="log-page">
      <h1>{strings.common.practiceLog}</h1>
      <div className="stat-row">
        <div className="card stat sun">
          <b data-testid="streak">{streakDays(all, today)}</b> {strings.log.streak}
        </div>
        <div className="card stat teal">
          <b>{Math.round(weekMinutes)}</b> {strings.log.week}
        </div>
        <div className="card stat violet">
          <b>{all.length}</b> {strings.log.sessions}
        </div>
      </div>
      <section className="panel">
        <h2>{strings.log.lastFourWeeks}</h2>
        <div className="days" aria-label={tips.log.perDay}>
          {days.map((d) => (
            <div
              key={d.day}
              className={`day-bar${d.minutes === 0 ? ' rest-day' : ''}`}
              style={{ height: `${String(Math.max(4, (d.minutes / peak) * 100))}%` }}
              title={tips.log.day(d.day, d.minutes)}
            />
          ))}
        </div>
      </section>
      <section className="stack">
        <h2>{strings.log.recent}</h2>
        {recent.length === 0 && <p className="muted">{strings.log.empty}</p>}
        <ul className="session-list" data-testid="session-list">
          {recent.map((s) => (
            <li key={s.id}>
              <span className="muted">
                {new Date(s.startedAt).toLocaleDateString([], {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              <Link href={`/piece/${s.pieceId}`}>{titles.get(s.pieceId) ?? s.pieceId}</Link>
              <span>{s.bpm ? strings.log.bpm(s.bpm) : ''}</span>
              <b>{formatMinutes(s.durationSec)}</b>
              {s.note && (
                <span className="muted" style={{ gridColumn: '2 / -1' }}>
                  {s.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
