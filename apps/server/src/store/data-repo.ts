import { appendFile, mkdir, open, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  Annotations,
  AUDIO_EXTENSIONS,
  emptyAnnotations,
  kindOfFile,
  type FileKind,
  MAX_MUSIC_BYTES,
  MUSIC_EXTENSIONS,
  type MusicRef,
  ZIPPED_MUSIC_EXTENSIONS,
  extensionOf,
  Loop,
  type FileName,
  Loops,
  MAX_SCORE_BYTES,
  MAX_TRACK_BYTES,
  MetronomeSave,
  type MetronomeSettings,
  newId,
  PieceDraft,
  PiecePatch,
  Piece,
  PdfImportRequest,
  type PdfImport,
  PracticeSession,
  safeFileName,
  SettingsFile,
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
import { RepoGate } from './repo-gate.ts';

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
  gate?: RepoGate;
}

export function kindOf(file: FileName): FileKind {
  return kindOfFile(file) ?? 'tracks';
}

const LoopList = Loop.array();
const audioList = AUDIO_EXTENSIONS.join(', ');

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

function withMarker(doc: Annotations, marker: PdfImport | undefined): Annotations {
  return marker ? { ...doc, pdfImport: marker } : { version: doc.version, pages: doc.pages };
}

function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      for (const [path, text] of flatten(v, prefix ? `${prefix}.${k}` : k)) out.set(path, text);
    }
  } else {
    out.set(prefix, String(value));
  }
  return out;
}

export function describeMetronomeChange(
  before: MetronomeSettings | null,
  after: MetronomeSettings,
): string | null {
  if (before === null) return null;
  const old = flatten(before);
  const changes = [...flatten(after)]
    .filter(([path, text]) => old.get(path) !== text)
    .map(([path, text]) => `${path} ${old.get(path) ?? '?'} → ${text}`);
  return changes.length > 0 ? changes.join(', ') : null;
}

const KIND_NOUN: Record<FileKind, string> = { scores: 'score', tracks: 'track', music: 'music' };
const KIND_RULES: Record<FileKind, string> = {
  scores: 'A score must be a .pdf file',
  tracks: `Audio must be one of: ${audioList}`,
  music: `Music must be one of: ${MUSIC_EXTENSIONS.join(', ')}`,
};

function signed(n: number): string {
  return n > 0 ? `+${String(n)}` : String(n);
}

export function describeTransposition(
  before: readonly MusicRef[],
  patch: { music?: readonly { file: string; transpose?: number | undefined }[] | undefined },
): string | null {
  if (!patch.music || Object.keys(patch).length !== 1) return null;
  const old = new Map(before.map((m) => [m.file as string, m.transpose]));
  const changed = patch.music.filter((m) => (m.transpose ?? 0) !== (old.get(m.file) ?? 0));
  if (changed.length === 0) return null;
  return changed
    .map((m) => `Transpose ${m.file} to ${m.transpose ? signed(m.transpose) : 'the written key'}`)
    .join('; ');
}

export class DataRepo {
  private readonly dir: string;
  private readonly changes: ChangeRecorder;
  private readonly log: Logger;
  private readonly now: () => Date;
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly gate: RepoGate;
  private readonly tmp: string;

  constructor(opts: DataRepoOptions) {
    this.dir = opts.dir;
    this.gate = opts.gate ?? new RepoGate();
    this.tmp = resolveInside(opts.dir, '.state', 'tmp');
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
      await this.writeJson(this.path('pieces', piece.id, 'piece.json'), piece);
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
        ['music', patch.music],
      ] as const) {
        if (list === undefined) continue;
        const before = new Set(current[key].map((r) => r.file));
        const after = new Set(list.map((r) => r.file));
        if (before.size !== after.size || [...after].some((f) => !before.has(f))) {
          throw new RejectedError(`${key} may only be renamed or reordered here`);
        }
      }
      const pinOnly = patch.pinned !== undefined && Object.keys(patch).length === 1;
      const transposed = describeTransposition(current.music, patch);
      const next = Piece.parse({
        ...current,
        ...patch,
        updatedAt: pinOnly ? current.updatedAt : this.now().toISOString(),
      });
      await this.writeJson(this.path('pieces', id, 'piece.json'), next);
      this.log.info(
        { id, fields: Object.keys(patch), pinOnly, pinned: next.pinned },
        'dewidebug repo piece patched',
      );
      this.changes.markDirty(
        pinOnly
          ? `${next.pinned ? 'Pin' : 'Unpin'} ${quote(next.title)}`
          : transposed
            ? `${transposed} in ${quote(next.title)}`
            : `Edit ${quote(next.title)}`,
      );
      return next;
    });
  }

  private async touch(piece: Piece, reason: string): Promise<void> {
    const updatedAt = this.now().toISOString();
    await this.writeJson(this.path('pieces', piece.id, 'piece.json'), { ...piece, updatedAt });
    this.log.debug({ id: piece.id, reason, updatedAt }, 'dewidebug repo piece marked edited');
  }

  async deletePiece(id: Slug): Promise<void> {
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      await rm(this.path('pieces', id), { recursive: true, force: true });
      await this.locked('setlists', async () => {
        const lists = await this.getSetlists();
        const pruned = {
          setlists: lists.setlists.map((s) => ({
            ...s,
            pieceIds: s.pieceIds.filter((p) => p !== id),
          })),
        };
        await this.writeJson(this.path('setlists.json'), pruned);
      });
      this.log.info({ id }, 'dewidebug repo piece deleted and removed from setlists');
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
    if (kindOfFile(originalName) !== 'tracks') {
      throw new RejectedError(`Audio must be one of: ${audioList}`);
    }
    return this.addFile(id, originalName, source, 'tracks', {
      maxBytes: MAX_TRACK_BYTES,
      tooLarge,
    });
  }

  async addMusic(id: Slug, originalName: string, source: Upload): Promise<MusicRef> {
    const tooLarge = () =>
      new RejectedError(`Music file is over ${String(MAX_MUSIC_BYTES / 1024 / 1024)} MB`);
    if (source instanceof Blob && source.size > MAX_MUSIC_BYTES) throw tooLarge();
    const ext = extensionOf(originalName);
    if (kindOfFile(originalName) !== 'music') throw new RejectedError(KIND_RULES.music);
    const zipped = (ZIPPED_MUSIC_EXTENSIONS as readonly string[]).includes(ext);
    const ref = await this.addFile(id, originalName, source, 'music', {
      maxBytes: MAX_MUSIC_BYTES,
      tooLarge,
      checkHead: (head) => {
        if (zipped) {
          return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
            ? null
            : new RejectedError(`That .${ext} file is not a zip archive`);
        }
        const text = new TextDecoder()
          .decode(head.subarray(0, 64))
          .replace(/^\uFEFF/, '')
          .trimStart();
        return text.startsWith('<') ? null : new RejectedError(`That .${ext} file is not XML`);
      },
    });
    return { ...ref, transpose: 0 };
  }

  async removeFile(id: Slug, file: FileName): Promise<Piece> {
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      const kind = kindOf(file);
      if (!piece[kind].some((r) => r.file === file)) throw new NotFoundError(file);
      await rm(this.path('pieces', id, kind, file), { force: true });
      if (kind === 'scores') {
        await rm(this.path('pieces', id, 'annotations', `${file}.json`), { force: true });
      } else if (kind === 'tracks') {
        const loops = await this.getLoops(id);
        const { [file]: _removed, ...rest } = loops.tracks;
        await this.writeJson(this.path('pieces', id, 'loops.json'), { tracks: rest });
      }
      const next = Piece.parse({
        ...piece,
        scores: piece.scores.filter((r) => r.file !== file),
        tracks: piece.tracks.filter((r) => r.file !== file),
        music: piece.music.filter((r) => r.file !== file),
        bookmarks: piece.bookmarks.filter((b) => b.score !== file),
        updatedAt: this.now().toISOString(),
      });
      await this.writeJson(this.path('pieces', id, 'piece.json'), next);
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
    const parsed = Annotations.parse(input);
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      const before = await this.getAnnotations(id, file);
      const next = withMarker(parsed, before.pdfImport);
      const pages = changedPages(before, next);
      if (pages.length === 0) return next;
      await this.writeJson(this.path('pieces', id, 'annotations', `${file}.json`), next);
      await this.touch(piece, 'drawing');
      const where = pages.map((p) => `p.${String(p)}`).join(', ');
      this.changes.markDirty(`Annotate ${quote(piece.title)} (${file} ${where})`);
      return next;
    });
  }

  async importPdfMarks(id: Slug, file: FileName, input: unknown): Promise<Annotations> {
    const { pages: imported, ...result } = PdfImportRequest.parse(input);
    if (result.hidePdfAnnotations && result.converted === 0) {
      throw new RejectedError('Cannot hide the PDF marks without importing them');
    }
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      const before = await this.getAnnotations(id, file);
      if (before.pdfImport) {
        this.log.info(
          { id, file, earlier: before.pdfImport.at },
          'dewidebug repo pdf marks already imported; keeping the earlier import',
        );
        return before;
      }
      const pages = { ...before.pages };
      for (const [page, items] of Object.entries(imported)) {
        pages[page] = [...items, ...(before.pages[page] ?? [])];
      }
      const next = Annotations.parse({
        version: 1,
        pages,
        pdfImport: { ...result, at: this.now().toISOString() },
      });
      await this.writeJson(this.path('pieces', id, 'annotations', `${file}.json`), next);
      if (result.converted > 0) await this.touch(piece, 'pdf marks');
      const items = Object.values(imported).reduce((n, list) => n + list.length, 0);
      this.log.info(
        {
          id,
          file,
          converted: result.converted,
          items,
          hidden: result.hidePdfAnnotations,
          skipped: result.skipped,
        },
        'dewidebug repo pdf marks imported',
      );
      this.changes.markDirty(
        result.converted > 0
          ? `Import ${String(result.converted)} PDF marks into ${quote(piece.title)} (${file})`
          : `Check ${quote(piece.title)} (${file}) for PDF marks: ${
              result.skipped.length > 0
                ? `left as they are (${result.skipped.join(', ')})`
                : 'none to import'
            }`,
      );
      return next;
    });
  }

  async getLoops(id: Slug): Promise<Loops> {
    await this.getPiece(id);
    return readJson(this.path('pieces', id, 'loops.json'), Loops, () => ({ tracks: {} }));
  }

  async putTrackLoops(id: Slug, track: FileName, input: unknown): Promise<Loops> {
    const loops = LoopList.parse(input);
    if (loops.some((l) => l.endSec <= l.startSec)) {
      throw new RejectedError('A loop must end after it starts');
    }
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      if (!piece.tracks.some((t) => t.file === track)) {
        throw new RejectedError(`Unknown track: ${track}`);
      }
      const current = await this.getLoops(id);
      const { [track]: _previous, ...others } = current.tracks;
      const next: Loops = { tracks: loops.length > 0 ? { ...others, [track]: loops } : others };
      await this.writeJson(this.path('pieces', id, 'loops.json'), next);
      await this.touch(piece, 'loops');
      this.changes.markDirty(`Save loops for ${quote(piece.title)} (${track})`);
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
      this.log.debug({ setlists: next.setlists.length }, 'dewidebug repo setlists validated');
      const missing = next.setlists.flatMap((s) => s.pieceIds).filter((p) => !ids.has(p));
      if (missing.length > 0) throw new RejectedError(`Unknown piece(s): ${missing.join(', ')}`);
      await this.writeJson(this.path('setlists.json'), next);
      this.changes.markDirty('Update setlists');
      return next;
    });
  }

  async getSettings(): Promise<SettingsFile | null> {
    return readJson(this.path('settings.json'), SettingsFile.nullable(), () => null);
  }

  async putMetronome(input: unknown): Promise<SettingsFile | null> {
    const save = MetronomeSave.parse(input);
    return this.locked('settings', async () => {
      const current = await this.getSettings();
      const currentAt = current ? Date.parse(current.updatedAt) : -1;
      if (current && currentAt > save.at) {
        this.log.info(
          { incomingAt: save.at, storedAt: current.updatedAt },
          'dewidebug repo metronome save is older than the stored one; keeping the stored settings',
        );
        return current;
      }
      const change = describeMetronomeChange(current?.metronome ?? null, save.settings);
      if (current && change === null) {
        this.log.debug(
          { at: save.at },
          'dewidebug repo metronome save changed nothing; not written',
        );
        return current;
      }
      const next: SettingsFile = {
        metronome: save.settings,
        updatedAt: new Date(save.at).toISOString(),
      };
      await this.writeJson(this.path('settings.json'), next);
      this.log.info({ change, at: next.updatedAt }, 'dewidebug repo metronome settings saved');
      this.changes.markDirty(change === null ? 'Save metronome settings' : `Metronome: ${change}`);
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
          let json: unknown;
          try {
            json = JSON.parse(line);
          } catch {
            json = undefined;
          }
          const parsed = PracticeSession.safeParse(json);
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
      const lead = (await this.endsWithoutNewline(file)) ? '\n' : '';
      if (lead) this.log.warn({ file }, 'dewidebug repo log did not end with a newline; repairing');
      await appendFile(file, `${lead}${JSON.stringify(session)}\n`);
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
    kind: FileKind,
    rules: UploadRules,
  ): Promise<ScoreRef> {
    return this.locked(`piece:${id}`, async () => {
      const piece = await this.getPiece(id);
      const taken = new Set(
        [...piece.scores, ...piece.tracks, ...piece.music].map((r) => r.file as string),
      );
      let file: FileName;
      try {
        file = safeFileName(originalName, taken);
      } catch {
        throw new RejectedError(`Unsupported file name: ${originalName}`);
      }
      if (kindOfFile(file) !== kind) {
        throw new RejectedError(KIND_RULES[kind]);
      }
      const size = await writeUpload(this.path('pieces', id, kind, file), source, rules, this.tmp);
      const ref = { file, name: originalName.replace(/\.[^.]+$/, '') || file };
      const next = Piece.parse({
        ...piece,
        [kind]: [...piece[kind], ref],
        updatedAt: this.now().toISOString(),
      });
      await this.writeJson(this.path('pieces', id, 'piece.json'), next);
      this.log.info({ id, file, kind, bytes: size }, 'dewidebug repo file stored');
      this.changes.markDirty(`Add ${KIND_NOUN[kind]} ${file} to ${quote(piece.title)}`);
      return ref;
    });
  }

  private writeJson(path: string, value: unknown): Promise<void> {
    return writeJson(path, value, this.tmp);
  }

  private async endsWithoutNewline(file: string): Promise<boolean> {
    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return false;
    }
    if (size === 0) return false;
    const handle = await open(file, 'r');
    try {
      const last = Buffer.alloc(1);
      await handle.read(last, 0, 1, size - 1);
      return last[0] !== 0x0a;
    } finally {
      await handle.close();
    }
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
    const guarded = () => this.gate.write(fn);
    const run = previous.then(guarded, guarded);
    const settled = run.catch(() => undefined);
    this.locks.set(key, settled);
    void settled.then(() => {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    });
    return run;
  }
}

export { InvalidDataError, NotFoundError };
