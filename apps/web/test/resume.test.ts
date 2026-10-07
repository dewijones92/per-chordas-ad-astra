import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emptyResume,
  flushResume,
  parseResume,
  pullResume,
  readResume,
  rememberPath,
  rememberPieceScore,
  rememberScore,
  rememberTimer,
  savedTimer,
  scoreKey,
  shouldResumeTo,
} from '../src/resume/resume.ts';

describe('resume store', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('round-trips where you were, stamping each entry', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}'))),
    );
    rememberPath('/piece/romanza');
    rememberScore(scoreKey('romanza', 'a.pdf'), { page: 3, y: 120 });
    rememberPieceScore('romanza', 'a.pdf');
    const state = readResume();
    expect(state.lastPath?.path).toBe('/piece/romanza');
    expect(state.scores['romanza/a.pdf']).toMatchObject({ page: 3, y: 120 });
    expect(state.pieceScore['romanza']?.file).toBe('a.pdf');
    expect(state.lastPath?.at).toBeGreaterThan(0);
  });

  it('clears a timer with a stamped tombstone so other devices clear it too', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}'))),
    );
    rememberTimer('p', { accumulatedMs: 5000, startedAt: 1 });
    expect(savedTimer('p')).toEqual({ accumulatedMs: 5000, startedAt: 1 });
    rememberTimer('p', null);
    expect(savedTimer('p')).toBeNull();
    expect(readResume().timers['p']?.at).toBeGreaterThan(0);
  });

  it('survives missing, corrupt or wrongly shaped data', () => {
    expect(parseResume(null)).toEqual(emptyResume());
    expect(parseResume('{oops')).toEqual(emptyResume());
    expect(parseResume('[1,2]')).toEqual(emptyResume());
    expect(parseResume('{"lastPath":{"path":5,"at":1}}')).toEqual(emptyResume());
  });

  it('pulls the server copy and keeps the newest of each entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}'))),
    );
    rememberPath('/log');
    const local = readResume().lastPath?.at ?? 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              lastPath: { path: '/piece/phone', at: local + 10 },
              scores: { 'x/x.pdf': { page: 2, y: 0, at: 1 } },
            }),
          ),
        ),
      ),
    );
    await pullResume();
    expect(readResume().lastPath?.path).toBe('/piece/phone');
    expect(readResume().scores['x/x.pdf']?.page).toBe(2);
  });

  it('keeps working when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    rememberPath('/tools');
    await pullResume();
    flushResume();
    expect(readResume().lastPath?.path).toBe('/tools');
  });

  it('pushes the local state to the server after a pause', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    rememberPath('/piece/a');
    rememberPath('/piece/b');
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    ) as { lastPath: { path: string } };
    expect(body.lastPath.path).toBe('/piece/b');
  });

  it('only resumes from the front page, and only to a known kind of place', () => {
    const at = (path: string | null) => ({
      ...emptyResume(),
      lastPath: path === null ? null : { path, at: 1 },
    });
    expect(shouldResumeTo('/', at('/piece/romanza'))).toBe('/piece/romanza');
    expect(shouldResumeTo('/', at('/log'))).toBe('/log');
    expect(shouldResumeTo('/log', at('/piece/romanza'))).toBeNull();
    expect(shouldResumeTo('/', at('/'))).toBeNull();
    expect(shouldResumeTo('/', at(null))).toBeNull();
    expect(shouldResumeTo('/', at('https://evil.example/'))).toBeNull();
    expect(shouldResumeTo('/', at('/piece/../../x'))).toBeNull();
  });
});
