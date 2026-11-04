import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { api } from '../api/client.ts';
import { readResume, rememberTodayDone, stampTimes } from '../resume/resume.ts';
import { useAsync } from '../ui/use-async.ts';
import { describeSuggestion, rankToday, suggestionHref } from './today.ts';
import { strings, tips } from '../strings.ts';

export function TodaySection({ now }: { now: number }) {
  const facts = useAsync(() => api.getToday(), 'today');
  const [done, setDone] = useState(() => stampTimes(readResume().todayDone));
  const tried = useMemo(() => stampTimes(readResume().bitsTried), []);
  const items = useMemo(
    () => (facts.data ? rankToday(facts.data, tried, done, now) : []),
    [facts.data, tried, done, now],
  );

  useEffect(() => {
    if (!facts.data) return;
    console.info('dewidebug practise today ranked', {
      pieces: facts.data.pieces.length,
      tried: tried.size,
      doneMarks: done.size,
      suggested: items.map((s) => ({ key: s.key, score: Math.round(s.score * 10) / 10 })),
    });
  }, [facts.data, tried, done, items]);

  if (items.length === 0) return null;
  return (
    <section className="today" aria-label={tips.library.today.list} data-testid="today">
      <h2>{strings.library.today.title}</h2>
      <ul className="today-list">
        {items.map((s) => (
          <li key={s.key} className="today-item" data-testid="today-item">
            <Link href={suggestionHref(s)} className="today-link">
              {describeSuggestion(s, now)}
            </Link>
            <button
              type="button"
              className="btn small ghost"
              title={tips.library.today.doneFor(s.bit?.name ?? s.title)}
              data-testid="today-done"
              onClick={() => {
                console.info('dewidebug practise today marked done', { key: s.key });
                rememberTodayDone(s.key);
                setDone((current) => new Map(current).set(s.key, Date.now()));
              }}
            >
              {strings.library.today.done}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
