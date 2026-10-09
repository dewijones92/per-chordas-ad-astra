import { PDF_MARKS_VERSION, type Annotations, type PdfImport } from '@pcaa/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { pdfLibrary, type PDFPageProxy } from '../score/pdf.ts';
import { extractPdfMarks } from '../score/pdf-marks.ts';
import type { LoadState } from './use-annotations.ts';

export function needsPdfScan(marker: PdfImport | undefined): boolean {
  return !marker || (marker.converted === 0 && marker.version < PDF_MARKS_VERSION);
}

interface Options {
  pieceId: string;
  file: string;
  pages: PDFPageProxy[] | null;
  load: LoadState;
  doc: Annotations;
  adopt: (doc: Annotations) => void;
}

export function usePdfMarks({ pieceId, file, pages, load, doc, adopt }: Options) {
  const key = `${pieceId}/${file}`;
  const started = useRef<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const live = useRef(key);
  useLayoutEffect(() => {
    live.current = key;
  }, [key]);
  const scan = load === 'ready' && needsPdfScan(doc.pdfImport) && failed !== key;

  useEffect(() => {
    if (load !== 'ready') return;
    if (!needsPdfScan(doc.pdfImport)) {
      if (started.current !== key) {
        started.current = key;
        console.info('dewidebug pdf marks already checked; not scanning again', {
          key,
          marker: doc.pdfImport,
        });
      }
      return;
    }
    if (!pages || started.current === key || failed === key) return;
    started.current = key;
    const began = performance.now();
    void (async () => {
      try {
        const marks = await extractPdfMarks(pages, await pdfLibrary());
        const { found, ...request } = marks;
        console.info('dewidebug pdf marks scanned', {
          key,
          found,
          converted: marks.converted,
          hide: marks.hidePdfAnnotations,
          skipped: marks.skipped,
          ms: Math.round(performance.now() - began),
        });
        const saved = await api.importPdfMarks(pieceId, file, request);
        console.info('dewidebug pdf marks saved', {
          key,
          marker: saved.pdfImport,
          pages: Object.keys(saved.pages).length,
        });
        if (live.current !== key) {
          console.info('dewidebug pdf marks saved after leaving the score; not loading them here', {
            key,
            now: live.current,
          });
          return;
        }
        adopt(saved);
      } catch (e: unknown) {
        console.warn('dewidebug pdf marks import failed; showing the PDF as it is', {
          key,
          error: String(e),
        });
        setFailed(key);
      }
    })();
  }, [key, pieceId, file, pages, load, doc.pdfImport, failed, adopt]);

  return {
    importing: scan,
    hidePdfAnnotations: doc.pdfImport?.hidePdfAnnotations ?? false,
  };
}
