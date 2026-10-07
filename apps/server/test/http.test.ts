import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makePdf } from '@pcaa/fixtures';
import type { Health, Piece } from '@pcaa/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { ipInCidr, isTrusted } from '../src/http/ip.ts';
import { parseRange } from '../src/http/serve-file.ts';
import { DataRepo } from '../src/store/data-repo.ts';
import { engineFor, silentLog, tempDir } from './helpers.ts';

describe('ipInCidr', () => {
  it.each([
    ['172.21.0.5', '172.21.0.0/16', true],
    ['::ffff:172.21.9.9', '172.21.0.0/16', true],
    ['172.22.0.5', '172.21.0.0/16', false],
    ['127.0.0.1', '127.0.0.0/8', true],
    ['::1', '::1/128', true],
    ['10.0.0.1', '0.0.0.0/0', true],
    ['10.0.0.1', '10.0.0.1', true],
    ['fe80::1', '127.0.0.0/8', false],
    ['300.1.1.1', '0.0.0.0/0', false],
    ['10.0.0.1', '10.0.0.0/33', false],
  ])('%s in %s → %s', (ip, cidr, expected) => {
    expect(ipInCidr(ip, cidr)).toBe(expected);
  });

  it('treats an unknown caller as untrusted', () => {
    expect(isTrusted(undefined, ['0.0.0.0/0'])).toBe(false);
  });
});

describe('parseRange', () => {
  it.each([
    ['bytes=0-9', 100, { start: 0, end: 9 }],
    ['bytes=90-', 100, { start: 90, end: 99 }],
    ['bytes=-10', 100, { start: 90, end: 99 }],
    ['bytes=50-500', 100, { start: 50, end: 99 }],
    ['bytes=100-', 100, null],
    ['bytes=-0', 100, null],
    ['bytes=5-1', 100, null],
    ['items=0-1', 100, null],
    ['bytes=-', 100, null],
  ])('%s of %d bytes', (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected);
  });
});

describe('HTTP API', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof createApp>;
  let caller: string | undefined;

  beforeEach(async () => {
    ({ path: dir, cleanup } = await tempDir());
    const data = join(dir, 'data');
    const web = join(dir, 'web');
    await mkdir(join(web, 'assets'), { recursive: true });
    await writeFile(join(web, 'index.html'), '<!doctype html><title>app</title>');
    await writeFile(join(web, 'assets', 'app-abc.js'), 'console.log(1)');
    const sync = engineFor(data, '', { idleMs: 60_000 });
    await sync.init();
    const repo = new DataRepo({ dir: data, changes: sync, log: silentLog });
    caller = '172.21.0.7';
    app = createApp({
      repo,
      sync,
      log: silentLog,
      version: 'test-1',
      trustedCidrs: ['172.21.0.0/16'],
      staticDir: web,
      remoteAddress: () => caller,
    });
  });
  afterEach(async () => cleanup());

  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  async function createPieceWithScore(): Promise<Piece> {
    const piece = (await (
      await app.request('/api/pieces', json({ title: 'Romanza' }))
    ).json()) as Piece;
    const form = new FormData();
    form.set('file', new File([makePdf(['Romanza'])], 'Romanza.pdf', { type: 'application/pdf' }));
    const upload = await app.request(`/api/pieces/${piece.id}/scores`, {
      method: 'POST',
      body: form,
    });
    expect(upload.status).toBe(201);
    return piece;
  }

  it('serves health to anyone, with version and sync state', async () => {
    caller = '8.8.8.8';
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Health;
    expect(body).toMatchObject({ ok: true, version: 'test-1', sync: { phase: 'clean' } });
  });

  it('refuses callers outside the trusted network', async () => {
    caller = '8.8.8.8';
    expect((await app.request('/api/pieces')).status).toBe(403);
    expect((await app.request('/')).status).toBe(403);
    caller = undefined;
    expect((await app.request('/api/pieces')).status).toBe(403);
  });

  it('creates, reads, patches and deletes a piece', async () => {
    const created = await app.request(
      '/api/pieces',
      json({ title: 'Spanish Romance', tags: ['classical'] }),
    );
    expect(created.status).toBe(201);
    const piece = (await created.json()) as Piece;
    expect(piece.id).toBe('spanish-romance');

    const patched = await app.request(`/api/pieces/${piece.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetBpm: 96 }),
    });
    expect(((await patched.json()) as Piece).targetBpm).toBe(96);

    expect((await app.request('/api/pieces')).status).toBe(200);
    expect((await app.request(`/api/pieces/${piece.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await app.request(`/api/pieces/${piece.id}`)).status).toBe(404);
  });

  it('maps validation failures to 400 and business rejections to 422', async () => {
    expect((await app.request('/api/pieces', json({ title: '' }))).status).toBe(400);
    expect((await app.request('/api/pieces/Not A Slug')).status).toBe(400);
    const piece = await createPieceWithScore();
    const form = new FormData();
    form.set('file', new File(['not a pdf'], 'x.pdf'));
    const res = await app.request(`/api/pieces/${piece.id}/scores`, { method: 'POST', body: form });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'That file is not a PDF' });
  });

  it('serves an uploaded file whole and by byte range', async () => {
    const piece = await createPieceWithScore();
    const whole = await app.request(`/api/pieces/${piece.id}/files/romanza.pdf`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await whole.arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');

    const part = await app.request(`/api/pieces/${piece.id}/files/romanza.pdf`, {
      headers: { range: 'bytes=0-3' },
    });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 0-3/${String(bytes.length)}`);
    expect(await part.text()).toBe('%PDF');

    const bad = await app.request(`/api/pieces/${piece.id}/files/romanza.pdf`, {
      headers: { range: 'bytes=999999-' },
    });
    expect(bad.status).toBe(416);
  });

  it('round-trips annotations and reports dirty sync state until flushed', async () => {
    const piece = await createPieceWithScore();
    const doc = {
      version: 1,
      pages: {
        '1': [{ kind: 'stamp', id: 'a', colour: '#123456', glyph: 'P', x: 1, y: 2, size: 20 }],
      },
    };
    const put = await app.request(`/api/pieces/${piece.id}/annotations/romanza.pdf`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(doc),
    });
    expect(put.status).toBe(200);
    expect(
      await (await app.request(`/api/pieces/${piece.id}/annotations/romanza.pdf`)).json(),
    ).toEqual(doc);
    expect(((await (await app.request('/api/sync')).json()) as { phase: string }).phase).toBe(
      'dirty',
    );
    const flushed = await app.request('/api/sync/flush', { method: 'POST' });
    expect(((await flushed.json()) as { phase: string }).phase).toBe('clean');
  });

  it('records and lists practice sessions', async () => {
    const piece = await createPieceWithScore();
    const res = await app.request(
      '/api/sessions',
      json({
        pieceId: piece.id,
        startedAt: '2026-10-07T10:00:00.000Z',
        durationSec: 300,
        bpm: 80,
        note: '',
      }),
    );
    expect(res.status).toBe(201);
    const list = (await (
      await app.request(`/api/sessions?pieceId=${piece.id}`)
    ).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it('serves the SPA: hashed assets cached forever, unknown paths fall back to index.html', async () => {
    const asset = await app.request('/assets/app-abc.js');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const deep = await app.request('/piece/romanza');
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('<title>app</title>');
    expect(deep.headers.get('cache-control')).toBe('no-cache');
    expect((await app.request('/api/nope')).status).toBe(404);
  });
});
