import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FindImportResponse, FindSearchResponse, isMidi, type FoundScore } from '@pcaa/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { DataRepo } from '../src/store/data-repo.ts';
import { ResumeStore } from '../src/store/resume-store.ts';
import { defaultRoutes, findFor, OP9_MIDI, stubFetch, type Handler } from './find-helpers.ts';
import { engineFor, silentLog, tempDir } from './helpers.ts';

describe('find a score over HTTP', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  let repo: DataRepo;
  let handler: Handler;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ path: dir, cleanup } = await tempDir());
    const data = join(dir, 'data');
    await mkdir(data, { recursive: true });
    const sync = engineFor(data, '', { idleMs: 60_000 });
    await sync.init();
    repo = new DataRepo({ dir: data, changes: sync, log: silentLog });
    handler = defaultRoutes;
    app = createApp({
      repo,
      find: findFor(
        repo,
        stubFetch((url) => handler(url)),
      ),
      resume: new ResumeStore(data, silentLog),
      sync,
      log: silentLog,
      version: 'test-1',
      trustedCidrs: ['172.21.0.0/16'],
      remoteAddress: () => '172.21.0.7',
    });
  });
  afterEach(async () => cleanup());

  const post = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  async function found(): Promise<FoundScore> {
    const res = await app.request('/api/find?q=Chopin%20Nocturne');
    const list = FindSearchResponse.parse(await res.json());
    const hit = list.results.find((r) => r.id === 'mutopia:582');
    if (!hit) throw new Error('missing the Op. 9 No. 1 result');
    return hit;
  }

  it('searches and returns normalised results', async () => {
    const res = await app.request('/api/find?q=Chopin%20Nocturne');
    expect(res.status).toBe(200);
    const body = FindSearchResponse.parse(await res.json());
    expect(body.results.map((r) => r.id)).toContain('mutopia:582');
    expect(body.sources.map((s) => s.ok)).toEqual([true, true]);
  });

  it('says a missing or tiny query is a 422, not a crash', async () => {
    expect((await app.request('/api/find')).status).toBe(422);
    expect((await app.request('/api/find?q=a')).status).toBe(422);
  });

  it('serves a music file for the File check with its MIDI type', async () => {
    const res = await app.request(`/api/find/file?url=${encodeURIComponent(OP9_MIDI)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/midi');
    expect(isMidi(new Uint8Array(await res.arrayBuffer()))).toBe(true);
  });

  it('refuses to proxy an address on a site it does not search', async () => {
    const res = await app.request(
      `/api/find/file?url=${encodeURIComponent('https://evil.example/a.mid')}`,
    );
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain('not one of the sites');
  });

  it('says an address that is not a web address is a 422, not a crash', async () => {
    for (const bad of ['not a url', '', 'https://', 'https://www.example.org/%E0%A4%A.mid']) {
      const res = await app.request(`/api/find/file?url=${encodeURIComponent(bad)}`);
      expect(res.status, bad).toBe(422);
    }
  });

  it('refuses a result whose links are not web links, so one cannot reach the piece page', async () => {
    const hit = await found();
    for (const result of [
      { ...hit, pageUrl: 'javascript:alert(1)' },
      { ...hit, licenceUrl: 'data:text/html,hi' },
      { ...hit, files: hit.files.map((f) => ({ ...f, url: 'file:///etc/passwd' })) },
    ]) {
      const res = await app.request('/api/find/import', post({ result }));
      expect(res.status).toBe(400);
    }
  });

  it('imports a result into a new piece that keeps its licence and source', async () => {
    const res = await app.request('/api/find/import', post({ result: await found() }));
    expect(res.status).toBe(201);
    const body = FindImportResponse.parse(await res.json());
    expect(body.piece.source?.licence).toBe('Creative Commons Attribution-ShareAlike 2.5');
    expect(body.piece.scores).toHaveLength(1);
    expect(body.piece.music).toHaveLength(1);
    const listed = (await (await app.request('/api/pieces')).json()) as {
      source?: { name: string };
    }[];
    expect(listed[0]?.source?.name).toBe('Mutopia Project');
  });

  it('keeps the licence when the piece is later edited', async () => {
    const { piece } = FindImportResponse.parse(
      await (await app.request('/api/find/import', post({ result: await found() }))).json(),
    );
    const patched = await app.request(`/api/pieces/${piece.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'slowly' }),
    });
    expect(((await patched.json()) as { source: { name: string } }).source.name).toBe(
      'Mutopia Project',
    );
  });

  it('answers 502 with a plain message when the site is down, and creates nothing', async () => {
    const result = await found();
    handler = () => new Response('down', { status: 500 });
    const res = await app.request('/api/find/import', post({ result }));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain('answered 500');
    expect(await repo.listPieces()).toEqual([]);
  });

  it('rejects an import body that is not a result', async () => {
    expect((await app.request('/api/find/import', post({ result: { title: 'x' } }))).status).toBe(
      400,
    );
  });
});
