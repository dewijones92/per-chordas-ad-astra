import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makePdf } from '@pcaa/fixtures';
import { emptyAnnotations, FileName, Slug, type Annotations } from '@pcaa/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changedPages, DataRepo, RejectedError } from '../src/store/data-repo.ts';
import { NotFoundError } from '../src/store/files.ts';
import { silentLog, tempDir } from './helpers.ts';

class RecordingChanges {
  readonly descriptions: string[] = [];
  markDirty(description: string): void {
    this.descriptions.push(description);
  }
}

const pdf = makePdf(['Exercise 1', 'Exercise 2']);
const slug = (s: string) => Slug.parse(s);
const file = (s: string) => FileName.parse(s);

describe('DataRepo', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  let changes: RecordingChanges;
  let repo: DataRepo;

  beforeEach(async () => {
    ({ path: dir, cleanup } = await tempDir());
    changes = new RecordingChanges();
    repo = new DataRepo({
      dir,
      changes,
      log: silentLog,
      now: () => new Date('2026-10-07T12:00:00.000Z'),
    });
  });
  afterEach(async () => cleanup());

  it('creates pieces with unique slugs and describes each change', async () => {
    const a = await repo.createPiece({ title: 'Blackbird', tags: ['beatles'] });
    const b = await repo.createPiece({ title: 'Blackbird' });
    expect(a.id).toBe('blackbird');
    expect(b.id).toBe('blackbird-2');
    expect(a).toMatchObject({ artist: '', notes: '', targetBpm: null, scores: [] });
    expect(changes.descriptions).toEqual(["Add piece 'Blackbird'", "Add piece 'Blackbird'"]);
    expect((await repo.listPieces()).map((p) => p.id)).toEqual(['blackbird', 'blackbird-2']);
  });

  it('rejects a title that is blank', async () => {
    await expect(repo.createPiece({ title: '   ' })).rejects.toThrow();
  });

  it('stores a PDF score and refuses things that are not PDFs', async () => {
    const piece = await repo.createPiece({ title: 'Étude No. 1' });
    expect(piece.id).toBe('etude-no-1');
    const ref = await repo.addScore(piece.id, 'Carcassi Op.60 No.1.pdf', new Blob([pdf]));
    expect(ref).toEqual({ file: 'carcassi-op-60-no-1.pdf', name: 'Carcassi Op.60 No.1' });
    expect(await readFile(await repo.filePath(piece.id, ref.file))).toEqual(Buffer.from(pdf));
    await expect(
      repo.addScore(piece.id, 'notes.pdf', new Blob([new TextEncoder().encode('hello')])),
    ).rejects.toBeInstanceOf(RejectedError);
  });

  it('refuses audio of an unsupported type or over the size cap', async () => {
    const piece = await repo.createPiece({ title: 'Loop' });
    await expect(
      repo.addTrack(piece.id, 'song.exe', new Blob([new Uint8Array(4)])),
    ).rejects.toThrow(/Audio must be/);
    await expect(
      repo.addTrack(piece.id, 'big.mp3', new Blob([new Uint8Array(51 * 1024 * 1024)])),
    ).rejects.toThrow(/over 50 MB/);
  });

  it('only lets a patch rename or reorder files, never invent them', async () => {
    const piece = await repo.createPiece({ title: 'Tune' });
    const ref = await repo.addScore(piece.id, 'tune.pdf', new Blob([pdf]));
    const renamed = await repo.updatePiece(piece.id, { scores: [{ ...ref, name: 'Lead sheet' }] });
    expect(renamed.scores[0]?.name).toBe('Lead sheet');
    await expect(
      repo.updatePiece(piece.id, { scores: [{ file: 'ghost.pdf', name: 'Ghost' }] }),
    ).rejects.toBeInstanceOf(RejectedError);
  });

  it('saves annotations, describing the pages that changed, and skips no-op saves', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    const ref = await repo.addScore(piece.id, 'air.pdf', new Blob([pdf]));
    const doc: Annotations = {
      version: 1,
      pages: {
        '2': [{ kind: 'stamp', id: 's1', colour: '#ff0000', glyph: '1', x: 10, y: 20, size: 18 }],
      },
    };
    await repo.putAnnotations(piece.id, ref.file, doc);
    await repo.putAnnotations(piece.id, ref.file, doc);
    expect(changes.descriptions.at(-1)).toBe("Annotate 'Air' (air.pdf p.2)");
    expect(changes.descriptions.filter((d) => d.startsWith('Annotate'))).toHaveLength(1);
    expect(await repo.getAnnotations(piece.id, ref.file)).toEqual(doc);
  });

  it('returns empty annotations for a score nobody has drawn on', async () => {
    const piece = await repo.createPiece({ title: 'Blank' });
    const ref = await repo.addScore(piece.id, 'blank.pdf', new Blob([pdf]));
    expect(await repo.getAnnotations(piece.id, ref.file)).toEqual(emptyAnnotations());
  });

  it('removing a score also removes its annotations and bookmarks', async () => {
    const piece = await repo.createPiece({ title: 'Gone' });
    const ref = await repo.addScore(piece.id, 'gone.pdf', new Blob([pdf]));
    await repo.updatePiece(piece.id, {
      bookmarks: [{ id: 'b1', name: 'Bridge', score: ref.file, page: 2, y: 100 }],
    });
    await repo.putAnnotations(piece.id, ref.file, {
      version: 1,
      pages: {
        '1': [{ kind: 'text', id: 't', colour: '#000000', x: 1, y: 2, text: 'hi', size: 12 }],
      },
    });
    const after = await repo.removeFile(piece.id, ref.file);
    expect(after.scores).toEqual([]);
    expect(after.bookmarks).toEqual([]);
    await expect(repo.getAnnotations(piece.id, ref.file)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('validates loops against the piece’s tracks', async () => {
    const piece = await repo.createPiece({ title: 'Jam' });
    const track = await repo.addTrack(piece.id, 'Backing.mp3', new Blob([new Uint8Array(16)]));
    const loop = { id: 'l1', name: 'Solo', startSec: 10, endSec: 20, rate: 0.75 };
    await repo.putTrackLoops(piece.id, track.file, [loop]);
    expect((await repo.getLoops(piece.id)).tracks[track.file]).toEqual([loop]);
    await expect(repo.putTrackLoops(piece.id, file('other.mp3'), [loop])).rejects.toThrow(
      /Unknown track/,
    );
    await expect(
      repo.putTrackLoops(piece.id, track.file, [{ ...loop, endSec: 5 }]),
    ).rejects.toThrow(/end after it starts/);
  });

  it('keeps setlists consistent with the pieces that exist', async () => {
    const a = await repo.createPiece({ title: 'A' });
    const b = await repo.createPiece({ title: 'B' });
    await repo.putSetlists({ setlists: [{ id: 's', name: 'Warm-ups', pieceIds: [b.id, a.id] }] });
    await expect(
      repo.putSetlists({ setlists: [{ id: 's', name: 'X', pieceIds: [slug('nope')] }] }),
    ).rejects.toThrow(/Unknown piece/);
    await repo.deletePiece(a.id);
    expect((await repo.getSetlists()).setlists[0]?.pieceIds).toEqual([b.id]);
    expect(changes.descriptions.at(-1)).toBe("Delete piece 'A'");
  });

  it('appends practice sessions to a monthly log and filters them by piece', async () => {
    const a = await repo.createPiece({ title: 'A' });
    const b = await repo.createPiece({ title: 'B' });
    await repo.addSession({
      pieceId: a.id,
      startedAt: '2026-09-30T20:00:00.000Z',
      durationSec: 600,
      bpm: 90,
      note: '',
    });
    await repo.addSession({
      pieceId: b.id,
      startedAt: '2026-10-01T08:00:00.000Z',
      durationSec: 59,
      bpm: null,
      note: 'slow',
    });
    expect(await readFile(join(dir, 'log/2026/09.jsonl'), 'utf8')).toContain('"durationSec":600');
    expect((await repo.listSessions()).map((s) => s.pieceId)).toEqual(['a', 'b']);
    expect(await repo.listSessions({ pieceId: b.id })).toHaveLength(1);
    expect(changes.descriptions.slice(-2)).toEqual([
      "Practise 'A' for 10 min at 90 bpm",
      "Practise 'B' for 1 min",
    ]);
  });

  it('skips a corrupt log line rather than failing the whole history', async () => {
    const a = await repo.createPiece({ title: 'A' });
    await repo.addSession({
      pieceId: a.id,
      startedAt: '2026-10-01T08:00:00.000Z',
      durationSec: 60,
      bpm: null,
      note: '',
    });
    await writeFile(join(dir, 'log/2026/10.jsonl'), '{"bogus":true}\n', { flag: 'a' });
    expect(await repo.listSessions()).toHaveLength(1);
  });

  it('refuses paths that escape the data directory', () => {
    expect(() => repo.path('..', 'etc', 'passwd')).toThrow(/outside the data directory/);
  });

  it('reports a missing piece as not found', async () => {
    await expect(repo.getPiece(slug('missing'))).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.filePath(slug('missing'), file('x.pdf'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('DataRepo review fixes', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  let repo: DataRepo;

  beforeEach(async () => {
    ({ path: dir, cleanup } = await tempDir());
    repo = new DataRepo({ dir, changes: new RecordingChanges(), log: silentLog });
  });
  afterEach(async () => cleanup());

  it('refuses a score whose name is not .pdf, and a track whose name is .pdf', async () => {
    const piece = await repo.createPiece({ title: 'Chart' });
    await expect(repo.addScore(piece.id, 'chart.mp3', new Blob([pdf]))).rejects.toThrow(/\.pdf/);
    await expect(repo.addTrack(piece.id, 'song.pdf', new Blob([pdf]))).rejects.toThrow(
      /Audio must be/,
    );
  });

  it('skips a corrupt log line instead of failing the whole history', async () => {
    const a = await repo.createPiece({ title: 'A' });
    await repo.addSession({
      pieceId: a.id,
      startedAt: '2026-10-01T08:00:00.000Z',
      durationSec: 60,
      bpm: null,
      note: '',
    });
    await writeFile(join(dir, 'log/2026/10.jsonl'), '{"truncated": tr', { flag: 'a' });
    await repo.addSession({
      pieceId: a.id,
      startedAt: '2026-10-02T08:00:00.000Z',
      durationSec: 90,
      bpm: null,
      note: '',
    });
    const sessions = await repo.listSessions();
    expect(sessions.map((s) => s.durationSec)).toEqual([60, 90]);
  });

  it('keeps an in-flight upload out of the git working tree', async () => {
    const piece = await repo.createPiece({ title: 'Temp' });
    let release: () => void = () => undefined;
    const paused = new Promise<void>((r) => {
      release = r;
    });
    let step = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        step += 1;
        if (step === 1) controller.enqueue(pdf);
        else if (step === 2) {
          await paused;
          controller.enqueue(new Uint8Array(10));
        } else controller.close();
      },
    });
    const upload = repo.addScore(piece.id, 'slow.pdf', stream);
    await new Promise((r) => setTimeout(r, 50));
    const during = (await readdir(dir, { recursive: true })).filter((f) => !f.startsWith('.state'));
    release();
    await upload;
    expect(during.filter((f) => /\.(tmp|upload)$/.test(f))).toEqual([]);
  });

  it('a save that arrives while a piece is being deleted does not resurrect it', async () => {
    const piece = await repo.createPiece({ title: 'Doomed' });
    const ref = await repo.addScore(piece.id, 'doomed.pdf', new Blob([pdf]));
    const doc = {
      version: 1,
      pages: {
        '1': [{ kind: 'stamp', id: 's', colour: '#000000', glyph: '1', x: 1, y: 1, size: 10 }],
      },
    };
    const results = await Promise.allSettled([
      repo.deletePiece(piece.id),
      repo.putAnnotations(piece.id, ref.file, doc),
    ]);
    expect(results[0].status).toBe('fulfilled');
    await expect(readdir(join(dir, 'pieces'))).resolves.toEqual([]);
  });

  it('a setlist save racing a delete never keeps the deleted piece', async () => {
    for (let round = 0; round < 12; round++) {
      const a = await repo.createPiece({ title: `A ${String(round)}` });
      const b = await repo.createPiece({ title: `B ${String(round)}` });
      const save = () =>
        repo.putSetlists({ setlists: [{ id: 's', name: 'S', pieceIds: [a.id, b.id] }] });
      const del = () => repo.deletePiece(a.id);
      await Promise.allSettled(round % 2 === 0 ? [save(), del()] : [del(), save()]);
      const ids = (await repo.getSetlists()).setlists.flatMap((s) => s.pieceIds);
      expect(ids).not.toContain(a.id);
    }
  });

  it('saves loops one track at a time without touching other tracks', async () => {
    const piece = await repo.createPiece({ title: 'Loops' });
    const t1 = await repo.addTrack(piece.id, 'one.mp3', new Blob([new Uint8Array(8)]));
    const t2 = await repo.addTrack(piece.id, 'two.mp3', new Blob([new Uint8Array(8)]));
    const loop = { id: 'l', name: 'L', startSec: 1, endSec: 2, rate: 1 };
    await repo.putTrackLoops(piece.id, t1.file, [loop]);
    await repo.putTrackLoops(piece.id, t2.file, [{ ...loop, id: 'm' }]);
    await repo.putTrackLoops(piece.id, t1.file, []);
    expect((await repo.getLoops(piece.id)).tracks).toEqual({ [t2.file]: [{ ...loop, id: 'm' }] });
    await expect(repo.putTrackLoops(piece.id, file('gone.mp3'), [loop])).rejects.toThrow();
  });
});

describe('changedPages', () => {
  it('finds pages added, removed or edited', () => {
    const stamp = {
      kind: 'stamp' as const,
      id: 's',
      colour: '#000000',
      glyph: '1' as const,
      x: 0,
      y: 0,
      size: 10,
    };
    const before: Annotations = { version: 1, pages: { '1': [stamp], '3': [stamp] } };
    const after: Annotations = {
      version: 1,
      pages: { '1': [stamp], '2': [stamp], '3': [{ ...stamp, x: 5 }] },
    };
    expect(changedPages(before, after)).toEqual([2, 3]);
    expect(changedPages(after, after)).toEqual([]);
  });
});
