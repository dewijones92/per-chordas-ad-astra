import {
  Annotations,
  Health,
  Loops,
  type Loop,
  Piece,
  PracticeSession,
  ScoreRef,
  Setlists,
  SyncStatus,
  TrackRef,
  type NewPracticeSession,
  type PieceDraft,
  type PiecePatch,
} from '@pcaa/shared';
import { z } from 'zod';
import { saves } from '../sync/saves.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ErrorBody = z.object({ error: z.string() });

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.output<S>> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(await res.json().catch(() => null));
    const message = parsed.success ? parsed.data.error : `${String(res.status)} ${res.statusText}`;
    console.info('dewidebug api error', { path, status: res.status, message });
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return schema.parse(undefined);
  return schema.parse(await res.json());
}

const jsonInit = (method: string, body: unknown, keepalive = false): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
  keepalive,
});

function upload(file: File): RequestInit {
  return {
    method: 'POST',
    headers: {
      'x-file-name': encodeURIComponent(file.name),
      'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  };
}

function tracked<T>(label: string, promise: Promise<T>): Promise<T> {
  return saves.track(label, promise);
}

const enc = encodeURIComponent;

export const api = {
  listPieces: () => request('/api/pieces', z.array(Piece)),
  getPiece: (id: string) => request(`/api/pieces/${enc(id)}`, Piece),
  createPiece: (draft: PieceDraft) =>
    tracked('new piece', request('/api/pieces', Piece, jsonInit('POST', draft))),
  patchPiece: (id: string, patch: PiecePatch, keepalive = false) =>
    tracked('piece', request(`/api/pieces/${enc(id)}`, Piece, jsonInit('PATCH', patch, keepalive))),
  deletePiece: (id: string) =>
    tracked('delete', request(`/api/pieces/${enc(id)}`, z.undefined(), { method: 'DELETE' })),
  uploadScore: (id: string, file: File) =>
    tracked('upload', request(`/api/pieces/${enc(id)}/scores`, ScoreRef, upload(file))),
  uploadTrack: (id: string, file: File) =>
    tracked('upload', request(`/api/pieces/${enc(id)}/tracks`, TrackRef, upload(file))),
  removeFile: (id: string, file: string) =>
    tracked(
      'remove file',
      request(`/api/pieces/${enc(id)}/files/${enc(file)}`, Piece, { method: 'DELETE' }),
    ),
  fileUrl: (id: string, file: string) => `/api/pieces/${enc(id)}/files/${enc(file)}`,
  getAnnotations: (id: string, file: string) =>
    request(`/api/pieces/${enc(id)}/annotations/${enc(file)}`, Annotations),
  putAnnotations: (id: string, file: string, doc: Annotations, keepalive = false) =>
    tracked(
      'drawing',
      request(
        `/api/pieces/${enc(id)}/annotations/${enc(file)}`,
        Annotations,
        jsonInit('PUT', doc, keepalive),
      ),
    ),
  getLoops: (id: string) => request(`/api/pieces/${enc(id)}/loops`, Loops),
  putTrackLoops: (id: string, track: string, loops: readonly Loop[]) =>
    tracked(
      'loops',
      request(`/api/pieces/${enc(id)}/loops/${enc(track)}`, Loops, jsonInit('PUT', loops)),
    ),
  getSetlists: () => request('/api/setlists', Setlists),
  putSetlists: (setlists: Setlists) =>
    tracked('setlists', request('/api/setlists', Setlists, jsonInit('PUT', setlists))),
  listSessions: (pieceId?: string) =>
    request(
      pieceId ? `/api/sessions?pieceId=${enc(pieceId)}` : '/api/sessions',
      z.array(PracticeSession),
    ),
  addSession: (session: NewPracticeSession) =>
    tracked('practice log', request('/api/sessions', PracticeSession, jsonInit('POST', session))),
  syncStatus: () => request('/api/sync', SyncStatus),
  flush: (reason: string, keepalive = false) =>
    request(`/api/sync/flush?reason=${enc(reason)}`, SyncStatus, { method: 'POST', keepalive }),
  health: () => request('/healthz', Health),
};
