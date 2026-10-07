import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/client.ts';
import { saves } from '../src/sync/saves.ts';

const piece = {
  id: 'romanza',
  title: 'Romanza',
  artist: '',
  tags: [],
  notes: '',
  targetBpm: null,
  scores: [],
  tracks: [],
  bookmarks: [],
  createdAt: '2026-10-07T10:00:00.000Z',
  updatedAt: '2026-10-07T10:00:00.000Z',
};

function respond(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
    ),
  );
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses responses with the shared schemas', async () => {
    respond(200, [piece]);
    const list = await api.listPieces();
    expect(list[0]?.title).toBe('Romanza');
  });

  it('rejects a response that does not match the schema', async () => {
    respond(200, [{ id: 'x' }]);
    await expect(api.listPieces()).rejects.toThrow();
  });

  it('turns server errors into ApiError with the server message', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    respond(422, { error: 'That file is not a PDF' });
    const error = await api
      .uploadScore('romanza', new File(['x'], 'x.pdf'))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, message: 'That file is not a PDF' });
    expect(saves.getSnapshot().lastError).toContain('That file is not a PDF');
    respond(500, 'not json');
    await expect(api.getPiece('romanza')).rejects.toMatchObject({ status: 500 });
  });

  it('handles 204 and builds encoded URLs', async () => {
    respond(204, undefined);
    await expect(api.deletePiece('romanza')).resolves.toBeUndefined();
    expect(api.fileUrl('a b', 'c.pdf')).toBe('/api/pieces/a%20b/files/c.pdf');
  });

  it('sends JSON bodies with the right method', async () => {
    respond(201, piece);
    await api.createPiece({ title: 'Romanza' });
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('/api/pieces');
    expect(call?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ title: 'Romanza' }) });
  });
});
