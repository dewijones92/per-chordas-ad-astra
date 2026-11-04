import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeMidi, makeMusicXml, makePdf, PIANO_WALTZ } from '@pcaa/fixtures';
import { emptyAnnotations, FileName, Slug, type Annotations } from '@pcaa/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changedPages, DataRepo, RejectedError } from '../src/store/data-repo.ts';
import { NotFoundError } from '../src/store/files.ts';
import { personOf } from '../src/person.ts';
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

  it('saves drawings on a music file by bar, and drops them with the file', async () => {
    const piece = await repo.createPiece({ title: 'Vals' });
    const xml = makeMusicXml(PIANO_WALTZ);
    const ref = await repo.addMusic(piece.id, 'vals.musicxml', new Blob([xml]));
    const doc: Annotations = {
      version: 1,
      pages: {
        '3': [{ kind: 'stamp', id: 's1', colour: '#ff0000', glyph: '2', x: 4, y: -10, size: 50 }],
      },
    };
    await repo.putAnnotations(piece.id, ref.file, doc);
    expect(changes.descriptions.at(-1)).toBe("Annotate 'Vals' (vals.musicxml bar 3)");
    expect(await repo.getAnnotations(piece.id, ref.file)).toEqual(doc);
    await repo.removeFile(piece.id, ref.file);
    await repo.addMusic(piece.id, 'vals.musicxml', new Blob([xml]));
    expect((await repo.getAnnotations(piece.id, ref.file)).pages).toEqual({});
  });

  it('keeps drawings on the falling notes apart from the notation, names the bar, and drops them with the file', async () => {
    const piece = await repo.createPiece({ title: 'Vals' });
    const xml = makeMusicXml(PIANO_WALTZ);
    const ref = await repo.addMusic(piece.id, 'vals.musicxml', new Blob([xml]));
    const notation: Annotations = {
      version: 1,
      pages: {
        '1': [{ kind: 'stamp', id: 'n1', colour: '#ff0000', glyph: '2', x: 4, y: -10, size: 50 }],
      },
    };
    const falling: Annotations = {
      version: 1,
      pages: {
        '3': [
          { kind: 'stamp', id: 'f1', colour: '#0000ff', glyph: '1', x: 64.5, y: 0.25, size: 21 },
        ],
      },
    };
    expect(await repo.getFallingDrawings(piece.id, ref.file)).toEqual(emptyAnnotations());
    await repo.putAnnotations(piece.id, ref.file, notation);
    await repo.putFallingDrawings(piece.id, ref.file, falling);
    await repo.putFallingDrawings(piece.id, ref.file, falling);
    expect(changes.descriptions.at(-1)).toBe(
      "Draw on the falling notes in 'Vals' (vals.musicxml bar 3)",
    );
    expect(changes.descriptions.filter((d) => d.startsWith('Draw on the falling'))).toHaveLength(1);
    expect(await repo.getFallingDrawings(piece.id, ref.file)).toEqual(falling);
    expect(await repo.getAnnotations(piece.id, ref.file)).toEqual(notation);
    expect(await readdir(join(dir, 'pieces', piece.id, 'annotations'))).toEqual([
      'vals.musicxml.falling.json',
      'vals.musicxml.json',
    ]);
    await repo.removeFile(piece.id, ref.file);
    await repo.addMusic(piece.id, 'vals.musicxml', new Blob([xml]));
    expect((await repo.getFallingDrawings(piece.id, ref.file)).pages).toEqual({});
  });

  it('only music has falling notes to draw on', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    const ref = await repo.addScore(piece.id, 'air.pdf', new Blob([pdf]));
    await expect(repo.getFallingDrawings(piece.id, ref.file)).rejects.toBeInstanceOf(RejectedError);
    await expect(
      repo.putFallingDrawings(piece.id, ref.file, emptyAnnotations()),
    ).rejects.toBeInstanceOf(RejectedError);
  });

  it('imports PDF marks once, beneath drawings already made, and keeps the marker on later saves', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    const ref = await repo.addScore(piece.id, 'air.pdf', new Blob([pdf]));
    const mine = {
      kind: 'stamp',
      id: 'mine',
      colour: '#ff0000',
      glyph: '1',
      x: 10,
      y: 20,
      size: 18,
    } as const;
    await repo.putAnnotations(piece.id, ref.file, { version: 1, pages: { '1': [mine] } });
    const ink = {
      kind: 'ink',
      id: 'pdf1',
      colour: '#ff2600',
      fillRule: 'nonzero',
      paths: [
        [
          [1, 1],
          [5, 1],
          [5, 5],
        ],
      ],
    } as const;
    const request = {
      version: 1,
      pages: { '1': [ink], '2': [{ ...ink, id: 'pdf2' }] },
      converted: 2,
      hidePdfAnnotations: true,
      skipped: [],
    };

    const imported = await repo.importPdfMarks(piece.id, ref.file, request);
    expect(imported.pages['1']?.map((i) => i.id)).toEqual(['pdf1', 'mine']);
    expect(imported.pages['2']?.map((i) => i.id)).toEqual(['pdf2']);
    expect(imported.pdfImport).toEqual({
      version: 1,
      at: '2026-10-07T12:00:00.000Z',
      converted: 2,
      hidePdfAnnotations: true,
      skipped: [],
    });
    expect(changes.descriptions.at(-1)).toBe("Import 2 PDF marks into 'Air' (air.pdf)");

    const again = await repo.importPdfMarks(piece.id, ref.file, {
      ...request,
      pages: { '1': [{ ...ink, id: 'pdf3' }] },
    });
    expect(again).toEqual(imported);
    expect(changes.descriptions.filter((d) => d.startsWith('Import'))).toHaveLength(1);

    await repo.putAnnotations(piece.id, ref.file, { version: 1, pages: { '1': [mine] } });
    const saved = await repo.getAnnotations(piece.id, ref.file);
    expect(saved.pages['1']?.map((i) => i.id)).toEqual(['mine']);
    expect(saved.pdfImport).toEqual(imported.pdfImport);
  });

  it('records a PDF with nothing to import so it is never scanned again', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    const ref = await repo.addScore(piece.id, 'air.pdf', new Blob([pdf]));
    const doc = await repo.importPdfMarks(piece.id, ref.file, {
      version: 1,
      pages: {},
      converted: 0,
      hidePdfAnnotations: false,
      skipped: ['Text (page 1)'],
    });
    expect(doc.pages).toEqual({});
    expect(doc.pdfImport?.skipped).toEqual(['Text (page 1)']);
    expect(changes.descriptions.at(-1)).toBe(
      "Check 'Air' (air.pdf) for PDF marks: left as they are (Text (page 1))",
    );
  });

  it('refuses to hide the PDF marks without importing any', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    const ref = await repo.addScore(piece.id, 'air.pdf', new Blob([pdf]));
    await expect(
      repo.importPdfMarks(piece.id, ref.file, {
        version: 1,
        pages: {},
        converted: 0,
        hidePdfAnnotations: true,
        skipped: [],
      }),
    ).rejects.toBeInstanceOf(RejectedError);
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

describe('DataRepo edited time and pins', () => {
  let cleanup: () => Promise<void>;
  let changes: RecordingChanges;
  let repo: DataRepo;
  let clock: Date;

  beforeEach(async () => {
    let dir: string;
    ({ path: dir, cleanup } = await tempDir());
    changes = new RecordingChanges();
    clock = new Date('2026-10-07T12:00:00.000Z');
    repo = new DataRepo({ dir, changes, log: silentLog, now: () => clock });
  });
  afterEach(async () => cleanup());

  const later = (iso: string) => {
    clock = new Date(iso);
    return iso;
  };

  it('pinning is not an edit: it keeps updatedAt and says Pin or Unpin', async () => {
    const piece = await repo.createPiece({ title: 'Romanza' });
    later('2026-10-08T09:00:00.000Z');
    const pinned = await repo.updatePiece(piece.id, { pinned: true });
    expect(pinned.pinned).toBe(true);
    expect(pinned.updatedAt).toBe(piece.updatedAt);
    expect(changes.descriptions.at(-1)).toBe("Pin 'Romanza'");
    const unpinned = await repo.updatePiece(piece.id, { pinned: false });
    expect(unpinned.updatedAt).toBe(piece.updatedAt);
    expect(changes.descriptions.at(-1)).toBe("Unpin 'Romanza'");
  });

  it('a patch that pins and edits together is an edit', async () => {
    const piece = await repo.createPiece({ title: 'Romanza' });
    const at = later('2026-10-08T09:00:00.000Z');
    const next = await repo.updatePiece(piece.id, { pinned: true, notes: 'slow bars 9-12' });
    expect(next.updatedAt).toBe(at);
    expect(changes.descriptions.at(-1)).toBe("Edit 'Romanza'");
  });

  it('pieces written before pins existed read as unpinned', async () => {
    const piece = await repo.createPiece({ title: 'Old' });
    const path = repo.path('pieces', piece.id, 'piece.json');
    const { pinned: _pinned, ...legacy } = JSON.parse(await readFile(path, 'utf8')) as Record<
      string,
      unknown
    >;
    await writeFile(path, JSON.stringify(legacy));
    expect((await repo.getPiece(piece.id)).pinned).toBe(false);
  });

  it('saves a pasted link and a rating on their own, stamping the day and leaving every other field alone', async () => {
    const piece = await repo.createPiece({
      title: 'The Lonely Waltz',
      artist: 'Someone',
      tags: ['waltz'],
      notes: 'slowly',
      targetBpm: 90,
    });
    const ref = await repo.addScore(piece.id, 'lonely.pdf', new Blob([pdf]));
    later('2026-11-04T08:30:00.000Z');
    const next = await repo.updatePiece(piece.id, {
      source: {
        url: 'https://musescore.com/user/1/scores/2',
        rating: { stars: 4.8, ratings: 120, views: 15_000 },
      },
    });
    expect(next.source).toEqual({
      name: 'MuseScore',
      url: 'https://musescore.com/user/1/scores/2',
      licence: null,
      licenceUrl: null,
      rating: { stars: 4.8, ratings: 120, views: 15_000, notedOn: '2026-11-04' },
    });
    expect(next).toMatchObject({
      title: 'The Lonely Waltz',
      artist: 'Someone',
      tags: ['waltz'],
      notes: 'slowly',
      targetBpm: 90,
      scores: [ref],
      createdAt: piece.createdAt,
    });
    expect(changes.descriptions.at(-1)).toBe("Source for 'The Lonely Waltz': MuseScore ⭐ 4.8");
    expect((await repo.getPiece(piece.id)).source).toEqual(next.source);
  });

  it('keeps the day a rating was noted until its numbers change, and says so without stars', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    const url = 'https://musescore.com/user/1/scores/2';
    later('2026-11-04T08:30:00.000Z');
    await repo.updatePiece(piece.id, {
      source: { url, rating: { stars: 4.8, ratings: 120, views: null } },
    });
    later('2026-11-09T08:30:00.000Z');
    const same = await repo.updatePiece(piece.id, {
      source: { url, rating: { stars: 4.8, ratings: 120, views: null } },
    });
    expect(same.source?.rating?.notedOn).toBe('2026-11-04');
    const changed = await repo.updatePiece(piece.id, {
      source: { url, rating: { stars: null, ratings: null, views: 9000 } },
    });
    expect(changed.source?.rating).toEqual({
      stars: null,
      ratings: null,
      views: 9000,
      notedOn: '2026-11-09',
    });
    expect(changes.descriptions.at(-1)).toBe("Source for 'Air': MuseScore");
  });

  it('keeps the licence Find a score recorded while the link stays, and a clear removes the source', async () => {
    const found = await repo.createPiece({
      title: 'Nocturne',
      source: {
        name: 'Mutopia Project',
        url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=582',
        licence: 'Public Domain',
        licenceUrl: 'https://creativecommons.org/licenses/publicdomain/',
      },
    });
    const rated = await repo.updatePiece(found.id, {
      source: {
        url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=582',
        rating: { stars: 5, ratings: null, views: null },
      },
    });
    expect(rated.source).toMatchObject({ licence: 'Public Domain', rating: { stars: 5 } });
    const cleared = await repo.updatePiece(found.id, { source: null });
    expect(cleared.source).toBeUndefined();
    expect(changes.descriptions.at(-1)).toBe("Remove the source of 'Nocturne'");
    expect(await readFile(repo.path('pieces', found.id, 'piece.json'), 'utf8')).not.toContain(
      'source',
    );
  });

  it('gives one file its own source, keeps the piece source, and a rename of the files never drops it', async () => {
    const piece = await repo.createPiece({ title: 'Gran Vals' });
    const score = await repo.addScore(piece.id, 'gran-vals.pdf', new Blob([pdf]));
    const music = await repo.addMusic(
      piece.id,
      'gran-vals.musicxml',
      new Blob([makeMusicXml(PIANO_WALTZ)]),
    );
    await repo.updatePiece(piece.id, {
      source: { url: 'https://musescore.com/user/1/scores/2', rating: null },
    });
    later('2026-11-04T08:30:00.000Z');
    const next = await repo.updatePiece(piece.id, {
      fileSource: {
        file: score.file,
        source: {
          url: 'https://imslp.org/wiki/Gran_Vals',
          rating: { stars: 4.5, ratings: null, views: null },
        },
      },
    });
    expect(next.source?.name).toBe('MuseScore');
    expect(next.scores[0]?.source).toEqual({
      name: 'IMSLP',
      url: 'https://imslp.org/wiki/Gran_Vals',
      licence: null,
      licenceUrl: null,
      rating: { stars: 4.5, ratings: null, views: null, notedOn: '2026-11-04' },
    });
    expect(next.music[0]?.source).toBeUndefined();
    expect(changes.descriptions.at(-1)).toBe(
      "Source for 'Gran Vals' (gran-vals.pdf): IMSLP ⭐ 4.5",
    );

    const renamed = await repo.updatePiece(piece.id, {
      scores: [{ file: score.file, name: 'Renamed' }],
      music: [{ file: music.file, name: 'Tune', transpose: 0 }],
    });
    expect(renamed.scores[0]).toMatchObject({ name: 'Renamed', source: { name: 'IMSLP' } });

    const smuggled = await repo.updatePiece(piece.id, {
      music: [
        {
          file: music.file,
          name: 'Tune',
          transpose: 0,
          source: {
            name: 'Evil',
            url: 'https://example.com/',
            licence: null,
            licenceUrl: null,
            rating: null,
          },
        },
      ],
    });
    expect(smuggled.music[0]?.source).toBeUndefined();

    const cleared = await repo.updatePiece(piece.id, {
      fileSource: { file: score.file, source: null },
    });
    expect(cleared.scores[0]?.source).toBeUndefined();
    expect(cleared.source?.name).toBe('MuseScore');
    expect(changes.descriptions.at(-1)).toBe("Remove the source of 'Gran Vals' (gran-vals.pdf)");
  });

  it('refuses a source for a file the piece does not have', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    await expect(
      repo.updatePiece(piece.id, {
        fileSource: {
          file: file('nope.pdf'),
          source: { url: 'https://imslp.org/x', rating: null },
        },
      }),
    ).rejects.toThrow(/nope\.pdf/);
  });

  it('refuses a link that is not http or https, and an empty rating', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    await expect(
      repo.updatePiece(piece.id, { source: { url: 'javascript:alert(1)', rating: null } }),
    ).rejects.toThrow();
    await expect(
      repo.updatePiece(piece.id, {
        source: {
          url: 'https://musescore.com/x',
          rating: { stars: null, ratings: null, views: null },
        },
      }),
    ).rejects.toThrow();
    expect((await repo.getPiece(piece.id)).source).toBeUndefined();
  });

  it('drawing on a score marks the piece edited; a no-op save does not', async () => {
    const piece = await repo.createPiece({ title: 'Air' });
    const ref = await repo.addScore(piece.id, 'air.pdf', new Blob([pdf]));
    const doc: Annotations = {
      version: 1,
      pages: {
        '1': [{ kind: 'stamp', id: 's1', colour: '#ff0000', glyph: '1', x: 10, y: 20, size: 18 }],
      },
    };
    const drawn = later('2026-10-09T10:00:00.000Z');
    await repo.putAnnotations(piece.id, ref.file, doc);
    expect((await repo.getPiece(piece.id)).updatedAt).toBe(drawn);
    later('2026-10-10T10:00:00.000Z');
    await repo.putAnnotations(piece.id, ref.file, doc);
    expect((await repo.getPiece(piece.id)).updatedAt).toBe(drawn);
  });

  it('saving loops marks the piece edited', async () => {
    const piece = await repo.createPiece({ title: 'Jam' });
    const track = await repo.addTrack(piece.id, 'Backing.mp3', new Blob([new Uint8Array(16)]));
    const at = later('2026-10-09T11:00:00.000Z');
    await repo.putTrackLoops(piece.id, track.file, [
      { id: 'l1', name: 'Solo', startSec: 10, endSec: 20, rate: 0.75 },
    ]);
    expect((await repo.getPiece(piece.id)).updatedAt).toBe(at);
  });

  it('importing PDF marks marks the piece edited only when something was converted', async () => {
    const piece = await repo.createPiece({ title: 'Etude' });
    const ref = await repo.addScore(piece.id, 'etude.pdf', new Blob([pdf]));
    later('2026-10-09T12:00:00.000Z');
    await repo.importPdfMarks(piece.id, ref.file, {
      version: 1,
      pages: {},
      converted: 0,
      hidePdfAnnotations: false,
      skipped: [],
    });
    expect((await repo.getPiece(piece.id)).updatedAt).toBe(piece.updatedAt);

    const other = await repo.addScore(piece.id, 'other.pdf', new Blob([pdf]));
    const at = later('2026-10-09T13:00:00.000Z');
    await repo.importPdfMarks(piece.id, other.file, {
      version: 1,
      pages: {
        '1': [{ kind: 'stamp', id: 'p1', colour: '#ff0000', glyph: '1', x: 1, y: 1, size: 18 }],
      },
      converted: 1,
      hidePdfAnnotations: false,
      skipped: [],
    });
    expect((await repo.getPiece(piece.id)).updatedAt).toBe(at);
  });
});

describe('DataRepo metronome settings', () => {
  let cleanup: () => Promise<void>;
  let changes: RecordingChanges;
  let repo: DataRepo;
  let dir: string;

  const settings = {
    bpm: 80,
    beatsPerBar: 4,
    subdivision: 1 as const,
    accentFirstBeat: true,
    trainer: { enabled: false, stepBpm: 5, everyBars: 4, maxBpm: 160 },
  };

  beforeEach(async () => {
    ({ path: dir, cleanup } = await tempDir());
    changes = new RecordingChanges();
    repo = new DataRepo({ dir, changes, log: silentLog });
  });
  afterEach(async () => cleanup());

  it('starts with no settings, then saves them as plain JSON stamped with the change time', async () => {
    expect(await repo.getSettings()).toBeNull();
    const at = Date.parse('2026-10-14T10:00:00.000Z');
    const saved = await repo.putMetronome({ settings, at });
    expect(saved).toEqual({
      metronome: { ...settings, sound: 'click', groove: 'rock' },
      updatedAt: '2026-10-14T10:00:00.000Z',
    });
    expect(changes.descriptions.at(-1)).toBe('Save metronome settings');
    expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))).toEqual(saved);
  });

  it('describes what changed in the commit message', async () => {
    await repo.putMetronome({ settings, at: 1000 });
    await repo.putMetronome({
      settings: { ...settings, bpm: 92, trainer: { ...settings.trainer, enabled: true } },
      at: 2000,
    });
    expect(changes.descriptions.at(-1)).toBe(
      'Metronome: bpm 80 → 92, trainer.enabled false → true',
    );
  });

  it('describes a switch to drums, and reads a settings.json written before drums existed', async () => {
    await writeFile(
      join(dir, 'settings.json'),
      JSON.stringify({ metronome: settings, updatedAt: '2026-10-14T10:00:00.000Z' }),
    );
    expect((await repo.getSettings())?.metronome).toMatchObject({ sound: 'click', groove: 'rock' });
    await repo.putMetronome({
      settings: { ...settings, sound: 'drums', groove: 'waltz', beatsPerBar: 3 },
      at: Date.parse('2026-10-15T10:00:00.000Z'),
    });
    expect(changes.descriptions.at(-1)).toBe(
      'Metronome: beatsPerBar 4 → 3, sound click → drums, groove rock → waltz',
    );
  });

  it('keeps newer stored settings over an older save, and skips a save that changes nothing', async () => {
    await repo.putMetronome({ settings: { ...settings, bpm: 120 }, at: 5000 });
    const stale = await repo.putMetronome({ settings: { ...settings, bpm: 60 }, at: 4000 });
    expect(stale?.metronome.bpm).toBe(120);
    const before = changes.descriptions.length;
    await repo.putMetronome({ settings: { ...settings, bpm: 120 }, at: 6000 });
    expect(changes.descriptions).toHaveLength(before);
    expect((await repo.getSettings())?.updatedAt).toBe(new Date(5000).toISOString());
  });

  it('rejects settings out of range', async () => {
    await expect(repo.putMetronome({ settings: { ...settings, bpm: 5 }, at: 1 })).rejects.toThrow();
    await expect(
      repo.putMetronome({ settings: { ...settings, subdivision: 7 }, at: 1 }),
    ).rejects.toThrow();
  });
});

describe('DataRepo music files', () => {
  let cleanup: () => Promise<void>;
  let changes: RecordingChanges;
  let repo: DataRepo;
  let dir: string;
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const xml = new TextEncoder().encode('﻿  <?xml version="1.0"?><museScore version="4.50"/>');

  beforeEach(async () => {
    ({ path: dir, cleanup } = await tempDir());
    changes = new RecordingChanges();
    repo = new DataRepo({ dir, changes, log: silentLog });
  });
  afterEach(async () => cleanup());

  it('stores MuseScore and MusicXML files untransposed, under music/', async () => {
    const piece = await repo.createPiece({ title: 'Gran Vals' });
    const ref = await repo.addMusic(piece.id, 'Gran Vals.mscz', new Blob([zip]));
    expect(ref).toEqual({ file: 'gran-vals.mscz', name: 'Gran Vals', transpose: 0 });
    await repo.addMusic(piece.id, 'gran vals.mscx', new Blob([xml]));
    const stored = await repo.getPiece(piece.id);
    expect(stored.music.map((m) => m.file)).toEqual(['gran-vals.mscz', 'gran-vals.mscx']);
    expect(await repo.filePath(piece.id, file('gran-vals.mscz'))).toBe(
      join(dir, 'pieces', 'gran-vals', 'music', 'gran-vals.mscz'),
    );
    expect(changes.descriptions.at(-1)).toBe("Add music gran-vals.mscx to 'Gran Vals'");
  });

  it('stores a MIDI file under its own name and keeps it as music', async () => {
    const piece = await repo.createPiece({ title: 'Nocturne' });
    const ref = await repo.addMusic(
      piece.id,
      'Nocturne Op 9.mid',
      new Blob([makeMidi(PIANO_WALTZ)]),
    );
    expect(ref).toEqual({ file: 'nocturne-op-9.mid', name: 'Nocturne Op 9', transpose: 0 });
    await repo.addMusic(piece.id, 'other.MIDI', new Blob([makeMidi(PIANO_WALTZ)]));
    expect((await repo.getPiece(piece.id)).music.map((m) => m.file)).toEqual([
      'nocturne-op-9.mid',
      'other.midi',
    ]);
  });

  it('refuses a zip that is not a zip, XML that is not XML, and other file types', async () => {
    const piece = await repo.createPiece({ title: 'X' });
    await expect(repo.addMusic(piece.id, 'a.mscz', new Blob([xml]))).rejects.toThrow(/not a zip/);
    await expect(repo.addMusic(piece.id, 'a.musicxml', new Blob([zip]))).rejects.toThrow(/not XML/);
    await expect(repo.addMusic(piece.id, 'a.mid', new Blob([xml]))).rejects.toThrow(/not a MIDI/);
    await expect(repo.addMusic(piece.id, 'a.midi', new Blob([zip]))).rejects.toThrow(/not a MIDI/);
    await expect(repo.addMusic(piece.id, 'a.pdf', new Blob([zip]))).rejects.toThrow(
      /Music must be one of/,
    );
    await expect(repo.addScore(piece.id, 'a.mscz', new Blob([zip]))).rejects.toThrow();
  });

  it('saves a transposition and says so in the commit message', async () => {
    const piece = await repo.createPiece({ title: 'Gran Vals' });
    const ref = await repo.addMusic(piece.id, 'vals.mxl', new Blob([zip]));
    const up = await repo.updatePiece(piece.id, { music: [{ ...ref, transpose: 2 }] });
    expect(up.music[0]?.transpose).toBe(2);
    expect(changes.descriptions.at(-1)).toBe("Transpose vals.mxl to +2 in 'Gran Vals'");
    await repo.updatePiece(piece.id, { music: [{ ...ref, transpose: 0 }] });
    expect(changes.descriptions.at(-1)).toBe(
      "Transpose vals.mxl to the written key in 'Gran Vals'",
    );
    await expect(
      repo.updatePiece(piece.id, { music: [{ ...ref, transpose: 30 }] }),
    ).rejects.toThrow();
    await expect(
      repo.updatePiece(piece.id, { music: [{ file: 'ghost.mscz', name: 'G', transpose: 0 }] }),
    ).rejects.toThrow(/only be renamed or reordered/);
  });

  it('transposes one music file without sending, or overwriting, the others', async () => {
    const piece = await repo.createPiece({ title: 'Two Files' });
    const a = await repo.addMusic(piece.id, 'a.mxl', new Blob([zip]));
    const b = await repo.addMusic(piece.id, 'b.mxl', new Blob([zip]));
    await repo.updatePiece(piece.id, { transposeFile: { file: b.file, transpose: 3 } });
    const up = await repo.updatePiece(piece.id, { transposeFile: { file: a.file, transpose: -5 } });
    expect(up.music.map((m) => [m.file, m.transpose])).toEqual([
      ['a.mxl', -5],
      ['b.mxl', 3],
    ]);
    expect(changes.descriptions.at(-1)).toBe("Transpose a.mxl to -5 in 'Two Files'");
    await repo.updatePiece(piece.id, { transposeFile: { file: b.file, transpose: 0 } });
    expect(changes.descriptions.at(-1)).toBe("Transpose b.mxl to the written key in 'Two Files'");
    await expect(
      repo.updatePiece(piece.id, { transposeFile: { file: 'ghost.mxl', transpose: 1 } }),
    ).rejects.toThrow(/Unknown music file/);
    await expect(
      repo.updatePiece(piece.id, { transposeFile: { file: a.file, transpose: 30 } }),
    ).rejects.toThrow();
    expect((await repo.getPiece(piece.id)).music.map((m) => m.transpose)).toEqual([-5, 0]);
  });

  it('removes a music file', async () => {
    const piece = await repo.createPiece({ title: 'Y' });
    const ref = await repo.addMusic(piece.id, 'y.mscz', new Blob([zip]));
    const next = await repo.removeFile(piece.id, ref.file);
    expect(next.music).toEqual([]);
    await expect(repo.filePath(piece.id, ref.file)).rejects.toThrow(NotFoundError);
  });
});

describe('DataRepo hard bits', () => {
  let cleanup: () => Promise<void>;
  let changes: RecordingChanges;
  let repo: DataRepo;
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const bit = (over: Record<string, unknown> = {}) => ({
    id: 'b1',
    name: 'The run',
    from: 11,
    to: 15,
    fromBar: 12,
    toBar: 16,
    bestSpeed: 0.6,
    ...over,
  });

  beforeEach(async () => {
    let dir: string;
    ({ path: dir, cleanup } = await tempDir());
    changes = new RecordingChanges();
    repo = new DataRepo({ dir, changes, log: silentLog });
  });
  afterEach(async () => cleanup());

  it('keeps hard bits per music file and says what changed', async () => {
    const piece = await repo.createPiece({ title: 'Gran Vals' });
    const a = await repo.addMusic(piece.id, 'a.mscz', new Blob([zip]));
    const b = await repo.addMusic(piece.id, 'b.mscz', new Blob([zip]));
    await repo.putFileHardBits(piece.id, a.file, [bit()]);
    expect(changes.descriptions.at(-1)).toBe("Mark hard bit 'The run' in 'Gran Vals' (a.mscz)");
    await repo.putFileHardBits(piece.id, b.file, [bit({ id: 'b2', name: 'Coda' })]);
    await repo.putFileHardBits(piece.id, a.file, [bit({ bestSpeed: 0.75 })]);
    expect(changes.descriptions.at(-1)).toBe(
      "Hard bit 'The run' up to 75% in 'Gran Vals' (a.mscz)",
    );
    const stored = await repo.getHardBits(piece.id);
    expect(Object.keys(stored.files)).toEqual(['b.mscz', 'a.mscz']);
    expect(stored.files['b.mscz']?.[0]?.name).toBe('Coda');
    await repo.putFileHardBits(piece.id, a.file, []);
    expect(changes.descriptions.at(-1)).toBe("Remove hard bit 'The run' in 'Gran Vals' (a.mscz)");
    expect(Object.keys((await repo.getHardBits(piece.id)).files)).toEqual(['b.mscz']);
  });

  it('refuses hard bits for a file the piece does not have, or that end before they start', async () => {
    const piece = await repo.createPiece({ title: 'X' });
    const a = await repo.addMusic(piece.id, 'a.mscz', new Blob([zip]));
    await expect(repo.putFileHardBits(piece.id, file('ghost.mscz'), [bit()])).rejects.toThrow(
      /Unknown music file/,
    );
    await expect(
      repo.putFileHardBits(piece.id, a.file, [bit({ from: 5, to: 2 })]),
    ).rejects.toThrow();
  });

  it('drops a music file’s hard bits when the file is removed', async () => {
    const piece = await repo.createPiece({ title: 'Y' });
    const a = await repo.addMusic(piece.id, 'a.mscz', new Blob([zip]));
    await repo.putFileHardBits(piece.id, a.file, [bit()]);
    await repo.removeFile(piece.id, a.file);
    expect((await repo.getHardBits(piece.id)).files).toEqual({});
  });
});

describe('DataRepo fingering', () => {
  let cleanup: () => Promise<void>;
  let changes: RecordingChanges;
  let repo: DataRepo;
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

  beforeEach(async () => {
    let dir: string;
    ({ path: dir, cleanup } = await tempDir());
    changes = new RecordingChanges();
    repo = new DataRepo({ dir, changes, log: silentLog });
  });
  afterEach(async () => cleanup());

  it('keeps one finger per written note per music file, and says which note in the commit', async () => {
    const piece = await repo.createPiece({ title: 'Nocturne' });
    const a = await repo.addMusic(piece.id, 'a.mscz', new Blob([zip]));
    const b = await repo.addMusic(piece.id, 'b.mscz', new Blob([zip]));
    await repo.putFinger(piece.id, a.file, {
      note: 's0m4t9600p70',
      finger: '3',
      label: 'B♭4 in bar 5',
    });
    expect(changes.descriptions.at(-1)).toBe("Finger 3 on B♭4 in bar 5 of 'Nocturne' (a.mscz)");
    await repo.putFinger(piece.id, a.file, {
      note: 's1m0t0p46',
      finger: '5',
      label: 'B♭2 in bar 1',
    });
    await repo.putFinger(piece.id, b.file, {
      note: 's0m0t0p60',
      finger: '1',
      label: 'C4 in bar 1',
    });
    const after = await repo.putFinger(piece.id, a.file, {
      note: 's0m4t9600p70',
      finger: '2',
      label: 'B♭4 in bar 5',
    });
    expect(after).toEqual({ notes: { s0m4t9600p70: '2', s1m0t0p46: '5' } });
    await repo.putFinger(piece.id, a.file, {
      note: 's1m0t0p46',
      finger: null,
      label: 'B♭2 in bar 1',
    });
    expect(changes.descriptions.at(-1)).toBe("Clear finger on B♭2 in bar 1 of 'Nocturne' (a.mscz)");
    expect(await repo.getFingering(piece.id)).toEqual({
      files: { 'a.mscz': { s0m4t9600p70: '2' }, 'b.mscz': { s0m0t0p60: '1' } },
    });
  });

  it('refuses a finger for an unknown file, a made-up note key or a finger outside 1-5', async () => {
    const piece = await repo.createPiece({ title: 'X' });
    const a = await repo.addMusic(piece.id, 'a.mscz', new Blob([zip]));
    await expect(
      repo.putFinger(piece.id, file('ghost.mscz'), { note: 's0m0t0p60', finger: '1', label: 'C4' }),
    ).rejects.toThrow(/Unknown music file/);
    await expect(
      repo.putFinger(piece.id, a.file, { note: '../evil', finger: '1', label: 'C4' }),
    ).rejects.toThrow();
    await expect(
      repo.putFinger(piece.id, a.file, { note: 's0m0t0p60', finger: '6', label: 'C4' }),
    ).rejects.toThrow();
  });

  it('keeps a finger on a grace note before the first beat, whose tick is negative', async () => {
    const piece = await repo.createPiece({ title: 'Grace' });
    const a = await repo.addMusic(piece.id, 'a.mscz', new Blob([zip]));
    const saved = await repo.putFinger(piece.id, a.file, {
      note: 's0m0t-60p66',
      finger: '2',
      label: 'F♯4 in bar 1',
    });
    expect(saved).toEqual({ notes: { 's0m0t-60p66': '2' } });
    expect((await repo.getFingering(piece.id)).files).toEqual({
      'a.mscz': { 's0m0t-60p66': '2' },
    });
  });

  it('drops a music file’s fingering when the file is removed', async () => {
    const piece = await repo.createPiece({ title: 'Y' });
    const a = await repo.addMusic(piece.id, 'a.mscz', new Blob([zip]));
    await repo.putFinger(piece.id, a.file, { note: 's0m0t0p60', finger: '1', label: 'C4' });
    await repo.removeFile(piece.id, a.file);
    expect((await repo.getFingering(piece.id)).files).toEqual({});
  });
});

describe('DataRepo practise-today facts', () => {
  let cleanup: () => Promise<void>;
  let repo: DataRepo;
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const dewi = personOf('dewi@example.com', 'dewi');
  const wife = personOf('wife@example.com', 'dewi');
  const bit = { id: 'b1', name: 'The run', from: 11, to: 15, fromBar: 12, toBar: 16 };

  beforeEach(async () => {
    let dir: string;
    ({ path: dir, cleanup } = await tempDir());
    repo = new DataRepo({ dir, changes: new RecordingChanges(), log: silentLog });
  });
  afterEach(async () => cleanup());

  it('lists only pieces that are pinned or have hard bits, with the asker’s own numbers', async () => {
    const vals = await repo.createPiece({ title: 'Gran Vals', targetBpm: 120 });
    const music = await repo.addMusic(vals.id, 'a.mscz', new Blob([zip]));
    await repo.putFileHardBits(vals.id, music.file, [{ ...bit, bestSpeed: 0.55 }], dewi);
    await repo.putHardBitBest(vals.id, music.file, 'b1', { bestSpeed: 0.9 }, wife);
    await repo.createPiece({ title: 'Plain' });
    const pinned = await repo.createPiece({ title: 'Pinned one' });
    await repo.updatePiece(pinned.id, { pinned: true });
    await repo.addSession(
      {
        pieceId: vals.id,
        startedAt: '2026-10-30T10:00:00.000Z',
        durationSec: 600,
        bpm: 90,
        note: '',
      },
      dewi,
    );
    await repo.addSession(
      {
        pieceId: vals.id,
        startedAt: '2026-11-01T10:00:00.000Z',
        durationSec: 600,
        bpm: 100,
        note: '',
      },
      wife,
    );

    const mine = await repo.getTodayFacts(dewi);
    expect(mine.pieces.map((p) => p.id)).toEqual(['gran-vals', 'pinned-one']);
    expect(mine.pieces[0]).toMatchObject({
      title: 'Gran Vals',
      pinned: false,
      targetBpm: 120,
      lastPractisedAt: Date.parse('2026-10-30T10:00:00.000Z'),
      bestBpm: 90,
      bits: [
        { file: 'a.mscz', id: 'b1', name: 'The run', fromBar: 12, toBar: 16, bestSpeed: 0.55 },
      ],
    });
    expect(mine.pieces[1]).toMatchObject({
      pinned: true,
      lastPractisedAt: null,
      bestBpm: null,
      bits: [],
    });

    const hers = await repo.getTodayFacts(wife);
    expect(hers.pieces[0]).toMatchObject({
      lastPractisedAt: Date.parse('2026-11-01T10:00:00.000Z'),
      bestBpm: 100,
      bits: [{ bestSpeed: 0.9 }],
    });
  });

  it('is empty for an empty library', async () => {
    expect(await repo.getTodayFacts(dewi)).toEqual({ pieces: [] });
  });
});
