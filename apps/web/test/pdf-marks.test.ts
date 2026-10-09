// @vitest-environment node
import { makePdf, type FixtureMark } from '@pcaa/fixtures';
import type { AnnotationItem } from '@pcaa/shared';
import { AnnotationMode, getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { boundsOf } from '../src/annotate/geometry.ts';
import { extractPdfMarks, type MarksPage } from '../src/score/pdf-marks.ts';

const lib = { OPS, AnnotationMode };
const square = '0 0 m 20 0 l 20 30 l 0 30 l h';

async function marksOf(pages: readonly (readonly FixtureMark[])[]) {
  const data = makePdf(
    pages.map((_, i) => `Page ${String(i + 1)}`),
    [595, 842],
    pages,
  );
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const loaded: MarksPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) loaded.push(await doc.getPage(n));
  let next = 0;
  const result = await extractPdfMarks(loaded, lib, () => `id${String(++next)}`);
  await doc.loadingTask.destroy();
  return result;
}

const only = <K extends AnnotationItem['kind']>(items: AnnotationItem[] | undefined, kind: K) =>
  (items ?? []).filter((i): i is Extract<AnnotationItem, { kind: K }> => i.kind === kind);

describe('extractPdfMarks', () => {
  it('turns every kind of Preview mark into an app drawing, in page coordinates', async () => {
    const result = await marksOf([
      [
        { kind: 'sketch', rect: [100, 700, 120, 730], colour: [255, 38, 0], path: square },
        { kind: 'highlight', rect: [50, 600, 250, 614], colour: [251, 92, 137] },
        { kind: 'strikeout', rect: [50, 560, 250, 570], colour: [236, 40, 20] },
        { kind: 'line', from: [60, 500], to: [200, 520], colour: [255, 64, 19] },
        { kind: 'freetext', rect: [300, 400, 400, 420], text: 'Slow here', size: 14 },
        { kind: 'link', rect: [10, 10, 60, 30] },
      ],
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.converted).toBe(5);
    expect(result.hidePdfAnnotations).toBe(true);
    expect(result.found).toEqual({ Stamp: 1, Highlight: 1, StrikeOut: 1, Line: 1, FreeText: 1 });
    const items = result.pages['1'];

    const [ink] = only(items, 'ink');
    expect(ink?.colour).toBe('#ff2600');
    expect(ink?.fillRule).toBe('nonzero');
    expect(ink && boundsOf(ink)).toEqual({ x: 100, y: 112, width: 20, height: 30 });

    const [highlight] = only(items, 'stroke');
    expect(highlight).toMatchObject({ tool: 'highlighter', colour: '#fb5c89', size: 14 });
    expect(highlight?.points).toEqual([
      [57, 235, 0.5],
      [243, 235, 0.5],
    ]);

    const lines = only(items, 'shape');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      shape: 'line',
      colour: '#ec2814',
      x1: 50,
      x2: 250,
      y1: 277,
      y2: 277,
    });
    expect(lines[1]).toMatchObject({
      colour: '#ff4013',
      x1: 60,
      y1: 342,
      x2: 200,
      y2: 322,
      size: 2,
    });

    const [text] = only(items, 'text');
    expect(text).toMatchObject({ text: 'Slow here', x: 300, y: 422, size: 14, colour: '#0000ff' });
  });

  it('keeps the fill rule and follows the page each mark is on', async () => {
    const ring = `${square} 5 5 m 15 5 l 15 25 l 5 25 l h`;
    const result = await marksOf([
      [],
      [
        {
          kind: 'sketch',
          rect: [10, 10, 30, 40],
          colour: [0, 253, 255],
          path: ring,
          evenOdd: true,
        },
      ],
    ]);
    expect(Object.keys(result.pages)).toEqual(['2']);
    const [ink] = only(result.pages['2'], 'ink');
    expect(ink?.fillRule).toBe('evenodd');
    expect(ink?.paths).toHaveLength(2);
    expect(ink?.colour).toBe('#00fdff');
  });

  it('turns a stroked, curved outline into a pen stroke in its own colour and width', async () => {
    const result = await marksOf([
      [
        {
          kind: 'sketch',
          rect: [100, 700, 140, 740],
          colour: [0, 0, 255],
          path: '',
          paint: '0 0 1 RG 3 w q 1 0 0 1 5 5 cm 0 0 m 10 20 20 20 30 0 c S Q',
        },
      ],
    ]);
    expect(result.converted).toBe(1);
    const [stroke] = only(result.pages['1'], 'stroke');
    expect(stroke).toMatchObject({ tool: 'pen', colour: '#0000ff', size: 3 });
    expect(stroke?.points[0]).toEqual([105, 137, 0.5]);
    expect(stroke?.points.at(-1)).toEqual([135, 137, 0.5]);
    expect(stroke?.points.length).toBeGreaterThan(5);
  });

  it('leaves a PDF alone when a mark is drawn with an image it cannot convert', async () => {
    const result = await marksOf([
      [
        {
          kind: 'sketch',
          rect: [100, 700, 120, 720],
          colour: [0, 0, 0],
          path: '',
          paint: 'q 20 0 0 20 0 0 cm BI /W 1 /H 1 /CS /G /BPC 8 /F /AHx ID 7f> EI Q',
        },
      ],
    ]);
    expect(result.converted).toBe(0);
    expect(result.hidePdfAnnotations).toBe(false);
    expect(result.skipped).toEqual(['Stamp drawn with paintInlineImageXObject (page 1)']);
  });

  it('converts nothing when any mark is a kind it cannot convert, so nothing is lost or doubled', async () => {
    const result = await marksOf([
      [
        { kind: 'sketch', rect: [100, 700, 120, 730], colour: [255, 38, 0], path: square },
        { kind: 'note', rect: [200, 200, 220, 220] },
      ],
    ]);
    expect(result.pages).toEqual({});
    expect(result.converted).toBe(0);
    expect(result.hidePdfAnnotations).toBe(false);
    expect(result.skipped).toEqual(['Text (page 1)']);
  });

  it('reports a PDF with only links as having nothing to convert', async () => {
    const result = await marksOf([[{ kind: 'link', rect: [10, 10, 60, 30] }]]);
    expect(result).toMatchObject({
      pages: {},
      converted: 0,
      hidePdfAnnotations: false,
      skipped: [],
    });
    expect(result.found).toEqual({});
  });
});
