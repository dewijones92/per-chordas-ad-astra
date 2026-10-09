import type * as PdfJs from 'pdfjs-dist';
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
