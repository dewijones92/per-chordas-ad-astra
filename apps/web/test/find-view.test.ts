import type { FoundFile, FoundScore } from '@pcaa/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/client.ts';
import { byline, formatChip, importSummary, musicToCheck } from '../src/library/find-view.ts';
import { strings } from '../src/strings.ts';

const file = (ext: FoundFile['ext'], label: string): FoundFile => ({
  ext,
  label,
  url: `https://x.example/${label}.${ext}`,
  bytes: null,
});

const result = (files: FoundFile[], over: Partial<FoundScore> = {}): FoundScore => ({
  id: 'mutopia:582',
  source: 'mutopia',
  sourceName: 'Mutopia Project',
  title: 'Nocturne No. 1 in B-flat minor',
  composer: 'F. F. Chopin',
  instrument: 'Piano',
  detail: 'Op. 9, No. 1',
  licence: 'Creative Commons Attribution-ShareAlike 2.5',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
  pageUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=582',
  files,
  ...over,
});

describe('find view', () => {
  it('labels a PDF and a music file with their own emoji', () => {
    expect(formatChip(file('pdf', 'PDF (A4)'))).toBe(strings.find.scoreFormat('PDF (A4)'));
    expect(formatChip(file('mid', 'MIDI'))).toBe(strings.find.musicFormat('MIDI'));
  });

  it('joins what is known about a result and skips what is not', () => {
    expect(byline(result([file('pdf', 'p')]))).toBe('F. F. Chopin · Piano · Op. 9, No. 1');
    expect(
      byline(result([file('pdf', 'p')], { composer: '', instrument: '', detail: '6 pages' })),
    ).toBe('6 pages');
  });

  it('says exactly what an import will bring: the first PDF and the richest music file', () => {
    const files = [file('pdf', 'PDF (A4)'), file('pdf', 'PDF (Letter)'), file('mid', 'MIDI')];
    expect(importSummary(result(files))).toBe(
      `${strings.find.scoreFormat('PDF (A4)')} + ${strings.find.musicFormat('MIDI')}`,
    );
    expect(musicToCheck(result(files))?.ext).toBe('mid');
    expect(importSummary(result([file('pdf', 'PDF')]))).toBe(strings.find.scoreFormat('PDF'));
    expect(musicToCheck(result([file('pdf', 'PDF')]))).toBeNull();
  });
});

describe('find api calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the server for a search with the query encoded', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', (path: string) => {
      asked.push(path);
      return Promise.resolve(
        new Response(JSON.stringify({ query: 'a b', results: [], sources: [] })),
      );
    });
    await api.findScores('a b&c');
    expect(asked).toEqual(['/api/find?q=a%20b%26c']);
  });

  it('returns the bytes of a music file for the check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new Uint8Array([77, 84, 104, 100])))),
    );
    expect([...(await api.findMusic('https://x.example/a.mid'))]).toEqual([77, 84, 104, 100]);
  });

  it('turns a failed music fetch into the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'site down' }), { status: 502 })),
      ),
    );
    await expect(api.findMusic('https://x.example/a.mid')).rejects.toEqual(
      new ApiError(502, 'site down'),
    );
  });
});
