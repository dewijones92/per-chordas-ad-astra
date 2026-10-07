import { appendFile, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  Annotations,
  emptyAnnotations,
  type FileName,
  Loops,
  MAX_SCORE_BYTES,
  MAX_TRACK_BYTES,
  newId,
  PieceDraft,
  PiecePatch,
  Piece,
  PracticeSession,
  safeFileName,
  Setlists,
  Slug,
  uniqueSlug,
  type NewPracticeSession,
  type ScoreRef,
  type TrackRef,
} from '@pcaa/shared';
import type { Logger } from '../log.ts';
import {
  InvalidDataError,
  NotFoundError,
  readJson,
  resolveInside,
  writeJson,
  writeUpload,
  type Upload,
  type UploadRules,
} from './files.ts';

export class RejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RejectedError';
  }
}

export interface ChangeRecorder {
  markDirty(description: string): void;
}

export interface DataRepoOptions {
  dir: string;
  changes: ChangeRecorder;
  log: Logger;
  now?: () => Date;
}

const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'ogg', 'wav', 'flac']);

export function kindOf(file: FileName): 'scores' | 'tracks' {
  return file.endsWith('.pdf') ? 'scores' : 'tracks';
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function quote(title: string): string {
  return `'${title}'`;
}

export function changedPages(before: Annotations, after: Annotations): number[] {
  const keys = new Set([...Object.keys(before.pages), ...Object.keys(after.pages)]);
  return [...keys]
    .filter((k) => JSON.stringify(before.pages[k] ?? []) !== JSON.stringify(after.pages[k] ?? []))
    .map(Number)
    .sort((a, b) => a - b);
}

export class DataRepo {
  private readonly dir: string;
  private readonly changes: ChangeRecorder;
  private readonly log: Logger;
  private readonly now: () => Date;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(opts: DataRepoOptions) {
    this.dir = opts.dir;
    this.changes = opts.changes;
    this.log = opts.log.child({ component: 'repo' });
    this.now = opts.now ?? (() => new Date());
  }

  path(...parts: string[]): string {
    return resolveInside(this.dir, ...parts);
  }

  async listPieces(): Promise<Piece[]> {
    let entries: string[];
    try {
      entries = await readdir(this.path('pieces'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const pieces: Piece[] = [];
    for (const entry of entries) {
      const id = Slug.safeParse(entry);
      if (!id.success) {
        this.log.warn({ entry }, 'dewidebug repo listPieces: skipping non-slug directory');
        continue;
      }
      try {
        pieces.push(await this.getPiece(id.data));
      } catch (error) {
        this.log.error(
          { err: error, entry },
          'dewidebug repo listPieces: unreadable piece skipped',
        );
      }
    }
    return pieces.sort((a, b) => a.title.localeCompare(b.title));
  }

  async getPiece(id: Slug): Promise<Piece> {
    return readJson(this.path('pieces', id, 'piece.json'), Piece);
  }

  async createPiece(input: unknown): Promise<Piece> {
    const draft = PieceDraft.parse(input);
    return this.locked('pieces', async () => {
      const existing = await this.listPieceIds();
      const at = this.now().toISOString();
      const piece = Piece.parse({
        ...draft,
        id: uniqueSlug(draft.title, existing),
        createdAt: at,
        updatedAt: at,
      });
      await writeJson(this.path('pieces', piece.id, 'piece.json'), piece);
      this.changes.markDirty(`Add piece ${quote(piece.title)}`);
      return piece;
    });
  }

  async updatePiece(id: Slug, input: unknown): Promise<Piece> {
    const patch = PiecePatch.parse(input);
    return this.locked(`piece:${id}`, async () => {
      const current = await this.getPiece(id);
      for (const [key, list] of [
        ['scores', patch.scores],
        ['tracks', patch.tracks],
      ] as const) {
        if (list === undefined) continue;
        const before = new Set(current[key].map((r) => r.file));
        const after = new Set(list.map((r) => r.file));
        if (before.size !== after.size || [...after].some((f) => !before.has(f))) {
          throw new RejectedError(`${key} may only be renamed or reordered here`);
        }
      }
      const next = Piece.parse({ ...current, ...patch, updatedAt: this.now().toISOString() });
      await writeJson(this.path('pieces', id, 'piece.json'), next);
      this.changes.markDirty(`Edit ${quote(next.title)}`);
      return next;
    });
  }

  async deletePiece(id: Slug): Promise<void> {
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      await rm(this.path('pieces', id), { recursive: true, force: true });
      const lists = await this.getSetlists();
      const pruned = {
        setlists: lists.setlists.map((s) => ({
          ...s,
          pieceIds: s.pieceIds.filter((p) => p !== id),
        })),
      };
      await writeJson(this.path('setlists.json'), pruned);
      this.changes.markDirty(`Delete piece ${quote(piece.title)}`);
    });
  }

  async addScore(id: Slug, originalName: string, source: Upload): Promise<ScoreRef> {
    const tooLarge = () =>
      new RejectedError(`PDF is over ${String(MAX_SCORE_BYTES / 1024 / 1024)} MB`);
    if (source instanceof Blob && source.size > MAX_SCORE_BYTES) throw tooLarge();
    return this.addFile(id, originalName, source, 'scores', {
      maxBytes: MAX_SCORE_BYTES,
      tooLarge,
      checkHead: (head) =>
        new TextDecoder().decode(head.subarray(0, 5)) === '%PDF-'
          ? null
          : new RejectedError('That file is not a PDF'),
    });
  }

  async addTrack(id: Slug, originalName: string, source: Upload): Promise<TrackRef> {
    const tooLarge = () =>
      new RejectedError(
        `Audio is over ${String(MAX_TRACK_BYTES / 1024 / 1024)} MB (GitHub rejects files over 100 MB)`,
      );
    if (source instanceof Blob && source.size > MAX_TRACK_BYTES) throw tooLarge();
    if (!AUDIO_EXTENSIONS.has(extensionOf(originalName))) {
      throw new RejectedError(`Audio must be one of: ${[...AUDIO_EXTENSIONS].join(', ')}`);
    }
    return this.addFile(id, originalName, source, 'tracks', {
      maxBytes: MAX_TRACK_BYTES,
      tooLarge,
    });
  }

  async removeFile(id: Slug, file: FileName): Promise<Piece> {
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      const kind = kindOf(file);
      if (!piece[kind].some((r) => r.file === file)) throw new NotFoundError(file);
      await rm(this.path('pieces', id, kind, file), { force: true });
      if (kind === 'scores') {
        await rm(this.path('pieces', id, 'annotations', `${file}.json`), { force: true });
      } else {
        const loops = await this.getLoops(id);
        const { [file]: _removed, ...rest } = loops.tracks;
        await writeJson(this.path('pieces', id, 'loops.json'), { tracks: rest });
      }
      const next = Piece.parse({
        ...piece,
        scores: piece.scores.filter((r) => r.file !== file),
        tracks: piece.tracks.filter((r) => r.file !== file),
        bookmarks: piece.bookmarks.filter((b) => b.score !== file),
        updatedAt: this.now().toISOString(),
      });
      await writeJson(this.path('pieces', id, 'piece.json'), next);
      this.changes.markDirty(`Remove ${file} from ${quote(piece.title)}`);
      return next;
    });
  }

  async filePath(id: Slug, file: FileName): Promise<string> {
    const piece = await this.getPiece(id);
    const kind = kindOf(file);
    if (!piece[kind].some((r) => r.file === file)) throw new NotFoundError(file);
    return this.path('pieces', id, kind, file);
  }

  async getAnnotations(id: Slug, file: FileName): Promise<Annotations> {
    await this.filePath(id, file);
    return readJson(
      this.path('pieces', id, 'annotations', `${file}.json`),
      Annotations,
      emptyAnnotations,
    );
  }

  async putAnnotations(id: Slug, file: FileName, input: unknown): Promise<Annotations> {
    const next = Annotations.parse(input);
    return this.locked(`annotations:${id}:${file}`, async () => {
      const piece = await this.getPiece(id);
      const before = await this.getAnnotations(id, file);
      const pages = changedPages(before, next);
      if (pages.length === 0) return next;
      await writeJson(this.path('pieces', id, 'annotations', `${file}.json`), next);
      const where = pages.map((p) => `p.${String(p)}`).join(', ');
      this.changes.markDirty(`Annotate ${quote(piece.title)} (${file} ${where})`);
      return next;
    });
  }

  async getLoops(id: Slug): Promise<Loops> {
    await this.getPiece(id);
    return readJson(this.path('pieces', id, 'loops.json'), Loops, () => ({ tracks: {} }));
  }

  async putLoops(id: Slug, input: unknown): Promise<Loops> {
    const next = Loops.parse(input);
    return this.locked(`loops:${id}`, async () => {
      const piece = await this.getPiece(id);
      const known = new Set(piece.tracks.map((t) => t.file as string));
      const unknown = Object.keys(next.tracks).filter((t) => !known.has(t));
      if (unknown.length > 0) throw new RejectedError(`Unknown track(s): ${unknown.join(', ')}`);
      for (const loops of Object.values(next.tracks)) {
        if (loops.some((l) => l.endSec <= l.startSec)) {
          throw new RejectedError('A loop must end after it starts');
        }
      }
      await writeJson(this.path('pieces', id, 'loops.json'), next);
      this.changes.markDirty(`Save loops for ${quote(piece.title)}`);
      return next;
    });
  }

  async getSetlists(): Promise<Setlists> {
    return readJson(this.path('setlists.json'), Setlists, () => ({ setlists: [] }));
  }

  async putSetlists(input: unknown): Promise<Setlists> {
    const next = Setlists.parse(input);
    return this.locked('setlists', async () => {
      const ids = await this.listPieceIds();
      const missing = next.setlists.flatMap((s) => s.pieceIds).filter((p) => !ids.has(p));
      if (missing.length > 0) throw new RejectedError(`Unknown piece(s): ${missing.join(', ')}`);
      await writeJson(this.path('setlists.json'), next);
      this.changes.markDirty('Update setlists');
      return next;
    });
  }

  async listSessions(filter: { pieceId?: Slug } = {}): Promise<PracticeSession[]> {
    const root = this.path('log');
    let years: string[];
    try {
      years = await readdir(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const sessions: PracticeSession[] = [];
    for (const year of years.filter((y) => /^\d{4}$/.test(y))) {
      for (const month of (await readdir(this.path('log', year))).filter((m) =>
        /^\d{2}\.jsonl$/.test(m),
      )) {
        const text = await readFile(this.path('log', year, month), 'utf8');
        text.split('\n').forEach((line, index) => {
          if (line.trim() === '') return;
          const parsed = PracticeSession.safeParse(JSON.parse(line));
          if (!parsed.success) {
            this.log.error(
              { file: `log/${year}/${month}`, line: index + 1 },
              'dewidebug repo listSessions: invalid line skipped',
            );
            return;
          }
          if (filter.pieceId === undefined || parsed.data.pieceId === filter.pieceId) {
            sessions.push(parsed.data);
          }
        });
      }
    }
    return sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  async addSession(input: NewPracticeSession): Promise<PracticeSession> {
    return this.locked('log', async () => {
      const piece = await this.getPiece(input.pieceId);
      const session = PracticeSession.parse({ ...input, id: newId() });
      const at = new Date(session.startedAt);
      const file = this.path(
        'log',
        String(at.getUTCFullYear()),
        `${String(at.getUTCMonth() + 1).padStart(2, '0')}.jsonl`,
      );
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify(session)}\n`);
      const minutes = Math.max(1, Math.round(session.durationSec / 60));
      this.changes.markDirty(
        `Practise ${quote(piece.title)} for ${String(minutes)} min${session.bpm ? ` at ${String(session.bpm)} bpm` : ''}`,
      );
      return session;
    });
  }

  private addFile(
    id: Slug,
    originalName: string,
    source: Upload,
    kind: 'scores' | 'tracks',
    rules: UploadRules,
  ): Promise<ScoreRef> {
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      const taken = new Set([...piece.scores, ...piece.tracks].map((r) => r.file as string));
      let file: FileName;
      try {
        file = safeFileName(originalName, taken);
      } catch {
        throw new RejectedError(`Unsupported file name: ${originalName}`);
      }
      const size = await writeUpload(this.path('pieces', id, kind, file), source, rules);
      const ref = { file, name: originalName.replace(/\.[^.]+$/, '') || file };
      const next = Piece.parse({
        ...piece,
        [kind]: [...piece[kind], ref],
        updatedAt: this.now().toISOString(),
      });
      await writeJson(this.path('pieces', id, 'piece.json'), next);
      this.log.info({ id, file, kind, bytes: size }, 'dewidebug repo file stored');
      this.changes.markDirty(
        `Add ${kind === 'scores' ? 'score' : 'track'} ${file} to ${quote(piece.title)}`,
      );
      return ref;
    });
  }

  private async listPieceIds(): Promise<Set<string>> {
    try {
      return new Set(await readdir(this.path('pieces')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
      throw error;
    }
  }

  private locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const settled = run.catch(() => undefined);
    this.locks.set(key, settled);
    void settled.then(() => {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    });
    return run;
  }
}

export { InvalidDataError, NotFoundError };
