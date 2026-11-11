import type * as PdfJs from 'pdfjs-dist';
import type { QuarterTurn } from '@pcaa/shared';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export type { PDFDocumentProxy, PDFPageProxy };

let library: Promise<typeof PdfJs> | null = null;
let loaded: typeof PdfJs | null = null;

export function pdfLibrary(): Promise<typeof PdfJs> {
  library ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    loaded = pdfjs;
    return pdfjs;
  });
  return library;
}

export function turnedViewport(page: PDFPageProxy, turn: QuarterTurn, scale: number) {
  return page.getViewport({ scale, rotation: (page.rotate + turn) % 360 });
}

export function turnTransform(
  turn: QuarterTurn,
  width: number,
  height: number,
): string | undefined {
  if (turn === 90) return `translate(${String(height)}px, 0) rotate(90deg)`;
  if (turn === 180) return `translate(${String(width)}px, ${String(height)}px) rotate(180deg)`;
  if (turn === 270) return `translate(0, ${String(width)}px) rotate(270deg)`;
  return undefined;
}

export function annotationMode(hidePdfAnnotations: boolean): number | undefined {
  if (!loaded) return undefined;
  return hidePdfAnnotations ? loaded.AnnotationMode.DISABLE : loaded.AnnotationMode.ENABLE;
}

export async function openPdf(
  url: string,
): Promise<{ doc: PDFDocumentProxy; pages: PDFPageProxy[] }> {
  const started = performance.now();
  const { getDocument } = await pdfLibrary();
  const doc = await getDocument({
    url,
    wasmUrl: '/pdfjs/wasm/',
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    iccUrl: '/pdfjs/iccs/',
  }).promise;
  const pages = await Promise.all(
    Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)),
  );
  console.info('dewidebug pdf opened', {
    url,
    pages: doc.numPages,
    ms: Math.round(performance.now() - started),
  });
  return { doc, pages };
}
