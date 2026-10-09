import type { AnnotationItem } from '@pcaa/shared';
import { describe, expect, it } from 'vitest';
import {
  historyReducer,
  initialHistory,
  itemsOn,
  type History,
  type HistoryAction,
} from '../src/annotate/history.ts';

const stamp = (id: string, x = 0): AnnotationItem => ({
  kind: 'stamp',
  id,
  colour: '#000000',
  glyph: '1',
  x,
  y: 0,
  size: 10,
});
const run = (
  actions: HistoryAction[],
  start: History = initialHistory({ version: 1, pages: {} }),
) => actions.reduce(historyReducer, start);

describe('annotation history', () => {
  it('adds items per page and undoes/redoes them', () => {
    let h = run([
      { type: 'add', page: 1, item: stamp('a') },
      { type: 'add', page: 2, item: stamp('b') },
    ]);
    expect(itemsOn(h.present, 1)).toHaveLength(1);
    h = historyReducer(h, { type: 'undo' });
    expect(itemsOn(h.present, 2)).toHaveLength(0);
    h = historyReducer(h, { type: 'redo' });
    expect(itemsOn(h.present, 2)).toHaveLength(1);
  });

  it('a new edit discards the redo stack', () => {
    const h = run([
      { type: 'add', page: 1, item: stamp('a') },
      { type: 'undo' },
      { type: 'add', page: 1, item: stamp('b') },
    ]);
    expect(h.future).toEqual([]);
    expect(itemsOn(h.present, 1).map((i) => i.id)).toEqual(['b']);
  });

  it('coalesces a drag (same group) into a single undo step', () => {
    let h = run([
      { type: 'add', page: 1, item: stamp('a') },
      { type: 'update', page: 1, item: stamp('a', 5), group: 'move-1' },
      { type: 'update', page: 1, item: stamp('a', 9), group: 'move-1' },
      { type: 'end-group' },
    ]);
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect(itemsOn(h.present, 1)[0]).toMatchObject({ x: 0 });
  });

  it('erasing several items in one drag is one undo step and empty pages disappear', () => {
    let h = run([
      { type: 'add', page: 3, item: stamp('a') },
      { type: 'add', page: 3, item: stamp('b') },
      { type: 'remove', page: 3, ids: ['a'], group: 'erase' },
      { type: 'remove', page: 3, ids: ['b'], group: 'erase' },
    ]);
    expect(h.present.pages).toEqual({});
    h = historyReducer(h, { type: 'undo' });
    expect(itemsOn(h.present, 3)).toHaveLength(2);
  });

  it('ignores no-op actions without growing history', () => {
    const start = run([{ type: 'add', page: 1, item: stamp('a') }]);
    for (const action of [
      { type: 'remove', page: 1, ids: ['zzz'] },
      { type: 'update', page: 1, item: stamp('zzz') },
      { type: 'clear-page', page: 9 },
      { type: 'end-group' },
      { type: 'redo' },
    ] as HistoryAction[]) {
      expect(historyReducer(start, action)).toBe(start);
    }
    expect(
      historyReducer(initialHistory({ version: 1, pages: {} }), { type: 'undo' }).past,
    ).toEqual([]);
  });

  it('clears a page as one undoable step and can reset', () => {
    let h = run([
      { type: 'add', page: 1, item: stamp('a') },
      { type: 'add', page: 1, item: stamp('b') },
      { type: 'clear-page', page: 1 },
    ]);
    expect(itemsOn(h.present, 1)).toEqual([]);
    h = historyReducer(h, { type: 'undo' });
    expect(itemsOn(h.present, 1)).toHaveLength(2);
    h = historyReducer(h, { type: 'reset', doc: { version: 1, pages: {} } });
    expect(h.past).toEqual([]);
  });

  it('caps history length', () => {
    let h = initialHistory({ version: 1, pages: {} });
    for (let i = 0; i < 250; i++)
      h = historyReducer(h, { type: 'add', page: 1, item: stamp(String(i)) });
    expect(h.past.length).toBe(200);
  });

  it('adds imported marks to every undo step, so undo and redo still work and keep them', () => {
    const marker = {
      version: 1,
      at: '2026-10-09T12:00:00.000Z',
      converted: 1,
      hidePdfAnnotations: true,
      skipped: [],
    };
    const drawn = run([{ type: 'add', page: 1, item: stamp('mine') }]);
    const imported = historyReducer(drawn, {
      type: 'import',
      pages: { '1': [stamp('pdf')], '2': [stamp('pdf2')] },
      pdfImport: marker,
    });
    expect(itemsOn(imported.present, 1).map((i) => i.id)).toEqual(['pdf', 'mine']);
    expect(imported.present.pdfImport).toEqual(marker);
    const undone = historyReducer(imported, { type: 'undo' });
    expect(itemsOn(undone.present, 1).map((i) => i.id)).toEqual(['pdf']);
    expect(itemsOn(undone.present, 2).map((i) => i.id)).toEqual(['pdf2']);
    expect(undone.present.pdfImport).toEqual(marker);
    const redone = historyReducer(undone, { type: 'redo' });
    expect(itemsOn(redone.present, 1).map((i) => i.id)).toEqual(['pdf', 'mine']);
    const twice = historyReducer(imported, {
      type: 'import',
      pages: { '1': [stamp('pdf')] },
      pdfImport: marker,
    });
    expect(itemsOn(twice.present, 1).map((i) => i.id)).toEqual(['pdf', 'mine']);
  });
});
