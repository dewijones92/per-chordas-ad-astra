import { describe, expect, it } from 'vitest';
import { applyAnnotationChanges, diffAnnotations, isNoChange } from '../src/annotation-changes.ts';
import { AnnotationChanges, type AnnotationItem, type Annotations } from '../src/schemas.ts';

const stamp = (id: string, x = 10): AnnotationItem => ({
  kind: 'stamp',
  id,
  colour: '#ff0000',
  glyph: '1',
  x,
  y: 20,
  size: 21,
});

const doc = (pages: Record<string, AnnotationItem[]>): Annotations => ({ version: 1, pages });

describe('drawing changes', () => {
  it('says what was added, changed, moved to another page and removed, and nothing for the same drawing', () => {
    const before = doc({ '1': [stamp('a'), stamp('b'), stamp('c')], '2': [stamp('d')] });
    const after = doc({
      '1': [stamp('a'), stamp('b', 99)],
      '2': [stamp('d'), stamp('e')],
      '3': [stamp('c')],
    });
    const changes = diffAnnotations(before, after);
    expect(changes.put).toEqual({ '1': [stamp('b', 99)], '2': [stamp('e')], '3': [stamp('c')] });
    expect(changes.remove).toEqual([]);
    expect(diffAnnotations(after, doc({ '1': [stamp('a')] })).remove.sort()).toEqual([
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(isNoChange(diffAnnotations(before, structuredClone(before)))).toBe(true);
    expect(AnnotationChanges.parse(changes)).toEqual(changes);
  });

  it('applied to what the server holds, keeps marks someone else made since', () => {
    const base = doc({ '1': [stamp('mine'), stamp('shared')] });
    const theirs = doc({
      '1': [stamp('mine'), stamp('shared'), stamp('theirs')],
      '4': [stamp('far')],
    });
    const mine = doc({ '1': [stamp('mine', 50), stamp('new')] });
    const merged = applyAnnotationChanges(theirs, diffAnnotations(base, mine));
    expect(merged.pages).toEqual({
      '1': [stamp('mine', 50), stamp('theirs'), stamp('new')],
      '4': [stamp('far')],
    });
  });

  it('keeps the drawing order when a mark changes, drops an emptied page and keeps the PDF import marker', () => {
    const held: Annotations = {
      version: 1,
      pages: { '1': [stamp('a'), stamp('b'), stamp('c')], '2': [stamp('z')] },
      pdfImport: {
        version: 1,
        at: '2026-11-04T08:00:00.000Z',
        converted: 1,
        hidePdfAnnotations: true,
        skipped: [],
      },
    };
    const next = applyAnnotationChanges(held, {
      version: 1,
      put: { '1': [stamp('b', 70)] },
      remove: ['z'],
    });
    expect(next.pages).toEqual({ '1': [stamp('a'), stamp('b', 70), stamp('c')] });
    expect(next.pdfImport).toEqual(held.pdfImport);
  });

  it('moves a mark to its new page rather than copying it', () => {
    const held = doc({ '1': [stamp('a'), stamp('b')] });
    const next = applyAnnotationChanges(held, {
      version: 1,
      put: { '2': [stamp('a')] },
      remove: [],
    });
    expect(next.pages).toEqual({ '1': [stamp('b')], '2': [stamp('a')] });
  });

  it('ignores removing a mark the server no longer has', () => {
    const held = doc({ '1': [stamp('a')] });
    expect(applyAnnotationChanges(held, { version: 1, put: {}, remove: ['gone'] }).pages).toEqual(
      held.pages,
    );
  });
});
