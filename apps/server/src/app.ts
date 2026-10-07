import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { FileName, NewPracticeSession, Slug, type Health, type SyncStatus } from '@pcaa/shared';
import { Hono, type Context } from 'hono';
import { ZodError } from 'zod';
import { isTrusted } from './http/ip.ts';
import { serveFile } from './http/serve-file.ts';
import type { Logger } from './log.ts';
import type { ResumeStore } from './store/resume-store.ts';
import {
  InvalidDataError,
  NotFoundError,
  RejectedError,
  type DataRepo,
} from './store/data-repo.ts';

export interface SyncControl {
  status(): SyncStatus;
  flush(reason: string): Promise<SyncStatus>;
}

export interface AppDeps {
  repo: DataRepo;
  resume: ResumeStore;
  sync: SyncControl;
  log: Logger;
  version: string;
  trustedCidrs: readonly string[];
  staticDir?: string;
  remoteAddress?: (c: Context) => string | undefined;
}

function remoteFromConnInfo(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

function uploadFrom(c: Context): { name: string; body: ReadableStream<Uint8Array> } {
  const header = c.req.header('x-file-name');
  if (!header) throw new RejectedError('Missing the X-File-Name header');
  const body = c.req.raw.body;
  if (!body) throw new RejectedError('The upload was empty');
  let name: string;
  try {
    name = decodeURIComponent(header);
  } catch {
    throw new RejectedError('X-File-Name must be URI-encoded');
  }
  return { name, body };
}

export function createApp(deps: AppDeps): Hono {
  const { repo, sync, log } = deps;
  const remoteAddress = deps.remoteAddress ?? remoteFromConnInfo;
  const app = new Hono();

  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    const ms = Math.round(performance.now() - started);
    const entry = { method: c.req.method, path: c.req.path, status: c.res.status, ms };
    if (c.res.status >= 500) log.error(entry, 'dewidebug http request');
    else if (c.req.path.startsWith('/api/')) log.info(entry, 'dewidebug http request');
    else log.debug(entry, 'dewidebug http request');
  });

  app.get('/healthz', (c) => {
    const health: Health = { ok: true, version: deps.version, sync: sync.status() };
    return c.json(health);
  });

  app.use('*', async (c, next) => {
    const ip = remoteAddress(c as Context);
    if (!isTrusted(ip, deps.trustedCidrs)) {
      log.warn(
        { ip, path: c.req.path },
        'dewidebug http refused: caller is not on a trusted network',
      );
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
    return undefined;
  });

  app.onError((error, c) => {
    if (error instanceof ZodError) {
      return c.json({ error: 'Invalid request', issues: error.issues }, 400);
    }
    if (error instanceof RejectedError) return c.json({ error: error.message }, 422);
    if (error instanceof NotFoundError) return c.json({ error: error.message }, 404);
    if (error instanceof InvalidDataError) {
      log.error({ err: error }, 'dewidebug http data file failed validation');
      return c.json({ error: 'A data file is invalid; see the server log' }, 500);
    }
    log.error({ err: error, path: c.req.path }, 'dewidebug http unhandled error');
    return c.json({ error: 'Internal error' }, 500);
  });

  const api = new Hono();

  api.use('*', async (c, next) => {
    const method = c.req.method;
    const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
    const isUpload = c.req.header('x-file-name') !== undefined;
    const isFlush = c.req.path.endsWith('/sync/flush');
    const type = c.req.header('content-type') ?? '';
    if (hasBody && !isUpload && !isFlush && !type.toLowerCase().startsWith('application/json')) {
      log.warn({ method, path: c.req.path, type }, 'dewidebug http refused: body is not JSON');
      return c.json({ error: 'Send JSON (Content-Type: application/json)' }, 415);
    }
    await next();
    return undefined;
  });
  const slug = (c: Context) => Slug.parse(c.req.param('id'));
  const file = (c: Context) => FileName.parse(c.req.param('file'));

  api.get('/pieces', async (c) => c.json(await repo.listPieces()));
  api.post('/pieces', async (c) => c.json(await repo.createPiece(await c.req.json()), 201));
  api.get('/pieces/:id', async (c) => c.json(await repo.getPiece(slug(c))));
  api.patch('/pieces/:id', async (c) =>
    c.json(await repo.updatePiece(slug(c), await c.req.json())),
  );
  api.delete('/pieces/:id', async (c) => {
    await repo.deletePiece(slug(c));
    return c.body(null, 204);
  });

  api.post('/pieces/:id/scores', async (c) => {
    const { name, body } = uploadFrom(c);
    return c.json(await repo.addScore(slug(c), name, body), 201);
  });
  api.post('/pieces/:id/tracks', async (c) => {
    const { name, body } = uploadFrom(c);
    return c.json(await repo.addTrack(slug(c), name, body), 201);
  });
  api.get('/pieces/:id/files/:file', async (c) => {
    const id = slug(c);
    const name = file(c);
    return serveFile(c, await repo.filePath(id, name), name);
  });
  api.delete('/pieces/:id/files/:file', async (c) =>
    c.json(await repo.removeFile(slug(c), file(c))),
  );

  api.get('/pieces/:id/annotations/:file', async (c) =>
    c.json(await repo.getAnnotations(slug(c), file(c))),
  );
  api.put('/pieces/:id/annotations/:file', async (c) =>
    c.json(await repo.putAnnotations(slug(c), file(c), await c.req.json())),
  );

  api.get('/pieces/:id/loops', async (c) => c.json(await repo.getLoops(slug(c))));
  api.put('/pieces/:id/loops/:file', async (c) =>
    c.json(await repo.putTrackLoops(slug(c), file(c), await c.req.json())),
  );

  api.get('/setlists', async (c) => c.json(await repo.getSetlists()));
  api.put('/setlists', async (c) => c.json(await repo.putSetlists(await c.req.json())));

  api.get('/sessions', async (c) => {
    const pieceId = c.req.query('pieceId');
    return c.json(await repo.listSessions(pieceId ? { pieceId: Slug.parse(pieceId) } : {}));
  });
  api.post('/sessions', async (c) =>
    c.json(await repo.addSession(NewPracticeSession.parse(await c.req.json())), 201),
  );

  api.get('/resume', async (c) => c.json(await deps.resume.get()));
  api.put('/resume', async (c) => c.json(await deps.resume.merge(await c.req.json())));

  api.get('/sync', (c) => c.json(sync.status()));
  api.post('/sync/flush', async (c) => c.json(await sync.flush(c.req.query('reason') ?? 'client')));

  api.all('*', (c) => c.json({ error: 'No such API route' }, 404));
  app.route('/api', api);

  if (deps.staticDir) {
    const root = deps.staticDir;
    app.use(
      '/assets/*',
      async (c, next) => {
        await next();
        if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
      serveStatic({ root }),
    );
    app.use('*', serveStatic({ root }));
    app.get('*', async (c) => {
      const html = await readFile(join(root, 'index.html'), 'utf8');
      c.header('Cache-Control', 'no-cache');
      return c.html(html);
    });
  }

  return app;
}
