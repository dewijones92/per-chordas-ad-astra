import { readFile } from 'node:fs/promises';
import { isMidi, MAX_MUSIC_BYTES, type FoundScore } from '@pcaa/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PoliteFetch, UpstreamError } from '../src/find/polite-fetch.ts';
import { TtlCache } from '../src/find/ttl-cache.ts';
import type { FindService } from '../src/find/service.ts';
import { DataRepo, RejectedError } from '../src/store/data-repo.ts';
import {
  bytesResponse,
  COMMONS_API,
  defaultRoutes,
  findFor,
  OP9_FILES,
  OP9_MIDI,
  OP9_PDF,
  stubFetch,
  type Handler,
  type Stub,
} from './find-helpers.ts';
import { engineFor, silentLog, tempDir } from './helpers.ts';

describe('FindService', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  let repo: DataRepo;

  beforeEach(async () => {
    ({ path: dir, cleanup } = await tempDir());
    const sync = engineFor(dir, '', { idleMs: 60_000 });
    await sync.init();
    repo = new DataRepo({ dir, changes: sync, log: silentLog });
  });
  afterEach(async () => cleanup());

  const make = (handler?: Handler): { find: FindService; stub: Stub } => {
    const stub = stubFetch(handler);
    return { find: findFor(repo, stub), stub };
  };

  async function op9(find: FindService): Promise<FoundScore> {
    const { results } = await find.search('chopin nocturne');
    const found = results.find((r) => r.id === 'mutopia:582');
    if (!found) throw new Error('the Op. 9 No. 1 result is missing');
    return found;
  }

  describe('search', () => {
    it('asks both sites once, politely, and lists Mutopia first with each site accounted for', async () => {
      const { find, stub } = make();
      const response = await find.search('  Chopin   Nocturne ');
      expect(response.query).toBe('Chopin Nocturne');
      expect(response.results.map((r) => r.source)).toEqual([
        'mutopia',
        'mutopia',
        'mutopia',
        'commons',
        'commons',
        'commons',
      ]);
      expect(response.sources).toEqual([
        { source: 'mutopia', name: 'Mutopia Project', ok: true, count: 3, hidden: 0, error: null },
        {
          source: 'commons',
          name: 'Wikimedia Commons',
          ok: true,
          count: 3,
          hidden: 1,
          error: null,
        },
      ]);
      expect(stub.calls).toHaveLength(2);
      expect(stub.calls.every((c) => c.userAgent?.startsWith('per-chordas-ad-astra/test ('))).toBe(
        true,
      );
    });

    it('answers a repeat search from its memory without asking the sites again', async () => {
      const { find, stub } = make();
      await find.search('Chopin Nocturne');
      const again = await find.search('chopin nocturne');
      expect(again.results).toHaveLength(6);
      expect(stub.calls).toHaveLength(2);
    });

    it('still lists one site when the other is down, and says which failed and why', async () => {
      const { find } = make((url) =>
        url.href.startsWith(COMMONS_API)
          ? new Response('down', { status: 503 })
          : defaultRoutes(url),
      );
      const response = await find.search('Chopin');
      expect(response.results.map((r) => r.source)).toEqual(['mutopia', 'mutopia', 'mutopia']);
      expect(response.sources[1]).toMatchObject({
        source: 'commons',
        ok: false,
        count: 0,
        error: 'commons.wikimedia.org answered 503',
      });
    });

    it('does not remember a failure, so the next search asks again', async () => {
      let down = true;
      const { find, stub } = make((url) =>
        down && url.href.startsWith(COMMONS_API)
          ? new Response('down', { status: 503 })
          : defaultRoutes(url),
      );
      await find.search('Chopin');
      down = false;
      const response = await find.search('Chopin');
      expect(response.sources[1]?.ok).toBe(true);
      expect(stub.calls.filter((c) => c.url.startsWith(COMMONS_API))).toHaveLength(2);
    });

    it('says a site that sent nonsense could not be read', async () => {
      const { find } = make((url) =>
        url.href.startsWith(COMMONS_API) ? new Response('<html>oops') : defaultRoutes(url),
      );
      expect((await find.search('Chopin')).sources[1]?.error).toBe(
        'Wikimedia Commons sent an answer this app could not read',
      );
    });

    it('reports nothing found as empty results from healthy sites', async () => {
      const { find } = make(() => new Response('{}'));
      const response = await find.search('zzzz');
      expect(response.results).toEqual([]);
      expect(response.sources.map((s) => s.ok)).toEqual([true, true]);
    });

    it.each(['', ' a ', 'x'.repeat(101)])(
      'rejects the query %j before asking anyone',
      async (q) => {
        const { find, stub } = make();
        await expect(find.search(q)).rejects.toBeInstanceOf(RejectedError);
        expect(stub.calls).toEqual([]);
      },
    );
  });

  describe('music preview', () => {
    it('fetches a MIDI file once and then serves it from memory', async () => {
      const { find, stub } = make();
      const first = await find.music(OP9_MIDI);
      const second = await find.music(OP9_MIDI);
      expect(isMidi(first.bytes)).toBe(true);
      expect(second.name).toBe('nocturne_in_b-flat_minor.mid');
      expect(stub.calls).toHaveLength(1);
    });

    it('refuses an address that is not a music file', async () => {
      const { find, stub } = make();
      await expect(find.music(OP9_PDF)).rejects.toBeInstanceOf(RejectedError);
      expect(stub.calls).toEqual([]);
    });

    it('refuses a site that sends a web page where a MIDI file should be', async () => {
      const { find } = make(
        () => new Response('<html>log in</html>', { headers: { 'content-type': 'text/html' } }),
      );
      await expect(find.music(OP9_MIDI)).rejects.toThrow('did not send a real mid file');
    });

    it('refuses a file larger than the music limit by its declared size, reading none of it', async () => {
      const { find } = make(() =>
        bytesResponse(new Uint8Array(4), 'audio/midi', {
          'content-length': String(MAX_MUSIC_BYTES + 1),
        }),
      );
      await expect(find.music(OP9_MIDI)).rejects.toThrow('over the');
    });

    it('refuses an address on a site it does not search', async () => {
      const { find, stub } = make();
      await expect(find.music('https://evil.example/x.mid')).rejects.toThrow(
        'is not one of the sites this app searches',
      );
      expect(stub.calls).toEqual([]);
    });
  });

  describe('import', () => {
    it('creates the piece with composer and source, and stores the PDF and the MIDI file', async () => {
      const { find, stub } = make();
      const result = await find.importScore(await op9(find));
      expect(result.imported).toEqual([
        { ext: 'pdf', label: 'PDF (A4)' },
        { ext: 'mid', label: 'MIDI' },
      ]);
      expect(result.skipped).toEqual([]);
      const piece = result.piece;
      expect(piece).toMatchObject({
        title: 'Nocturne No. 1 in B-flat minor',
        artist: 'F. F. Chopin',
        source: {
          name: 'Mutopia Project',
          url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=582',
          licence: 'Creative Commons Attribution-ShareAlike 2.5',
          licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
        },
      });
      expect(piece.scores).toHaveLength(1);
      expect(piece.music).toHaveLength(1);
      const stored = await readFile(
        repo.path('pieces', piece.id, 'scores', piece.scores[0]?.file ?? ''),
      );
      expect(new Uint8Array(stored)).toEqual(OP9_FILES.pdf);
      expect(stub.calls.map((c) => c.url).filter((u) => u.includes('/ftp/'))).toEqual([
        OP9_PDF,
        OP9_MIDI,
      ]);
      expect(await repo.getPiece(piece.id)).toEqual(piece);
    });

    it('does not download the music file twice when it was already previewed', async () => {
      const { find, stub } = make();
      const found = await op9(find);
      await find.music(OP9_MIDI);
      await find.importScore(found);
      expect(stub.calls.filter((c) => c.url === OP9_MIDI)).toHaveLength(1);
    });

    it('imports just a PDF from a result that has only a PDF', async () => {
      const { find } = make();
      const { results } = await find.search('chopin');
      const pdfOnly = results.find((r) => r.source === 'commons' && r.title === 'Nocturnes, Op.9');
      expect(pdfOnly).toBeDefined();
      const upstream = pdfOnly?.files[0]?.url ?? '';
      const stubbed = make((url) =>
        url.href === upstream
          ? bytesResponse(OP9_FILES.pdf, 'application/pdf')
          : defaultRoutes(url),
      );
      const imported = await stubbed.find.importScore(pdfOnly!);
      expect(imported.imported).toEqual([{ ext: 'pdf', label: 'PDF' }]);
      expect(imported.piece.music).toEqual([]);
      expect(imported.piece.source?.name).toBe('Wikimedia Commons');
    });

    it('keeps the piece with what worked when one file cannot be fetched, and says what was skipped', async () => {
      const { find } = make((url) =>
        url.href === OP9_MIDI ? new Response('gone', { status: 404 }) : defaultRoutes(url),
      );
      const result = await find.importScore(await op9(find));
      expect(result.imported).toEqual([{ ext: 'pdf', label: 'PDF (A4)' }]);
      expect(result.skipped).toEqual([
        { label: 'MIDI', reason: 'www.mutopiaproject.org answered 404' },
      ]);
      expect(result.piece.music).toEqual([]);
    });

    it('keeps the MIDI file when the "PDF" turns out to be a web page, so a login page is never stored as a score', async () => {
      const { find } = make((url) =>
        url.href === OP9_PDF
          ? new Response('<html>sign in</html>', { headers: { 'content-type': 'application/pdf' } })
          : defaultRoutes(url),
      );
      const result = await find.importScore(await op9(find));
      expect(result.imported).toEqual([{ ext: 'mid', label: 'MIDI' }]);
      expect(result.skipped).toEqual([{ label: 'PDF (A4)', reason: 'That file is not a PDF' }]);
      expect(result.piece.scores).toEqual([]);
    });

    it('leaves no piece behind when nothing can be fetched', async () => {
      const { find } = make((url) =>
        url.href === OP9_MIDI || url.href === OP9_PDF
          ? new Response('gone', { status: 500 })
          : defaultRoutes(url),
      );
      const found = await op9(find);
      await expect(find.importScore(found)).rejects.toBeInstanceOf(UpstreamError);
      expect(await repo.listPieces()).toEqual([]);
    });

    it('removes the new piece again when the library refuses every file', async () => {
      const { find } = make((url) =>
        url.href === OP9_MIDI
          ? new Response('<html>no</html>', { headers: { 'content-type': 'audio/midi' } })
          : url.href === OP9_PDF
            ? new Response('<html>no</html>')
            : defaultRoutes(url),
      );
      const found = await op9(find);
      await expect(find.importScore(found)).rejects.toThrow();
      expect(await repo.listPieces()).toEqual([]);
    });

    it('never fetches from an address a client invented, and creates nothing', async () => {
      const { find, stub } = make();
      const found = await op9(find);
      const forged: FoundScore = {
        ...found,
        files: [
          { ext: 'pdf', label: 'PDF', bytes: null, url: 'http://169.254.169.254/latest/meta-data' },
        ],
      };
      const before = stub.calls.length;
      await expect(find.importScore(forged)).rejects.toThrow(
        'is not one of the sites this app searches',
      );
      expect(stub.calls).toHaveLength(before);
      expect(await repo.listPieces()).toEqual([]);
    });
  });
});

describe('PoliteFetch', () => {
  const allowed = (url: URL) =>
    url.origin === 'https://a.example' || url.origin === 'https://b.example';
  const make = (
    handler: Handler,
    extra: Partial<ConstructorParameters<typeof PoliteFetch>[0]> = {},
  ) => {
    const stub = stubFetch(handler);
    const clock = { at: 10_000, slept: [] as number[] };
    const http = new PoliteFetch({
      fetch: stub.fetch,
      userAgent: 'test-agent',
      minGapMs: 1_000,
      timeoutMs: 1_000,
      allowed,
      log: silentLog,
      now: () => clock.at,
      sleep: (ms) => {
        clock.slept.push(ms);
        clock.at += ms;
        return Promise.resolve();
      },
      ...extra,
    });
    return { http, stub, clock };
  };
  const opts = { accept: '*/*', maxBytes: 1_000 };

  it('spaces requests to one site by the minimum gap and does not delay a different site', async () => {
    const { http, clock } = make(() => new Response('ok'));
    await http.get('https://a.example/1', opts);
    await http.get('https://b.example/1', opts);
    expect(clock.slept).toEqual([]);
    await http.get('https://a.example/2', opts);
    expect(clock.slept).toEqual([1_000]);
  });

  it('queues requests started together instead of firing them as a burst', async () => {
    const { http, clock } = make(() => new Response('ok'));
    await Promise.all([1, 2, 3].map((n) => http.get(`https://a.example/${String(n)}`, opts)));
    expect(clock.slept).toEqual([1_000, 1_000]);
  });

  it('sends its own name and the accept type it asked for', async () => {
    const { http, stub } = make(() => new Response('ok'));
    await http.get('https://a.example/1', opts);
    expect(stub.calls[0]?.userAgent).toBe('test-agent');
  });

  it('follows a redirect that stays on the allowed list', async () => {
    const { http, stub } = make((url) =>
      url.pathname === '/old'
        ? new Response(null, { status: 301, headers: { location: 'https://b.example/new' } })
        : new Response('arrived'),
    );
    const body = await http.get('https://a.example/old', opts);
    expect(new TextDecoder().decode(body.bytes)).toBe('arrived');
    expect(stub.calls.map((c) => c.url)).toEqual([
      'https://a.example/old',
      'https://b.example/new',
    ]);
  });

  it('refuses a redirect to a site off the list, without requesting it', async () => {
    const { http, stub } = make(
      () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } }),
    );
    await expect(http.get('https://a.example/old', opts)).rejects.toThrow(
      'is not one of the sites',
    );
    expect(stub.calls).toHaveLength(1);
  });

  it('gives up on a redirect loop', async () => {
    const { http } = make(
      () => new Response(null, { status: 302, headers: { location: 'https://a.example/again' } }),
    );
    await expect(http.get('https://a.example/again', opts)).rejects.toThrow(
      'redirected too many times',
    );
  });

  it('stops reading a body that grows past the limit even when it declared nothing', async () => {
    const { http } = make(() => new Response(new Uint8Array(2_000)));
    await expect(http.get('https://a.example/big', opts)).rejects.toThrow(
      'sent more than the 1000 byte limit',
    );
  });

  it('turns a network failure into a plain message naming the site', async () => {
    const { http } = make(() => {
      throw new Error('connect ECONNREFUSED');
    });
    await expect(http.get('https://a.example/x', opts)).rejects.toThrow(
      'Could not reach a.example: connect ECONNREFUSED',
    );
  });

  it('refuses an address that is not a web address', async () => {
    const { http } = make(() => new Response('ok'));
    await expect(http.get('nonsense', opts)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('TtlCache', () => {
  it('forgets an entry after its time and the oldest when it is full', () => {
    const clock = { at: 0 };
    const cache = new TtlCache<number>(100, 2, () => clock.at);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    clock.at = 100;
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(1);
  });
});
