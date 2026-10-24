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
    expect(saved).toEqual({ metronome: settings, updatedAt: '2026-10-14T10:00:00.000Z' });
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

  it('refuses a zip that is not a zip, XML that is not XML, and other file types', async () => {
    const piece = await repo.createPiece({ title: 'X' });
    await expect(repo.addMusic(piece.id, 'a.mscz', new Blob([xml]))).rejects.toThrow(/not a zip/);
    await expect(repo.addMusic(piece.id, 'a.musicxml', new Blob([zip]))).rejects.toThrow(/not XML/);
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

  it('removes a music file', async () => {
    const piece = await repo.createPiece({ title: 'Y' });
    const ref = await repo.addMusic(piece.id, 'y.mscz', new Blob([zip]));
    const next = await repo.removeFile(piece.id, ref.file);
    expect(next.music).toEqual([]);
    await expect(repo.filePath(piece.id, ref.file)).rejects.toThrow(NotFoundError);
  });
});
