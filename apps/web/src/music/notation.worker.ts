import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { notationSpans, type NotationRequest, type NotationResult } from './notation-protocol.ts';

let toolkit: Promise<VerovioToolkit> | null = null;

function getToolkit(): Promise<VerovioToolkit> {
  toolkit ??= createVerovioModule().then((module) => new VerovioToolkit(module));
  return toolkit;
}

self.onmessage = (event: MessageEvent<NotationRequest>) => {
  const request = event.data;
  const started = performance.now();
  getToolkit()
    .then((tk) => {
      tk.setOptions({
        breaks: 'none',
        expandNever: true,
        adjustPageHeight: true,
        header: 'none',
        footer: 'none',
        scale: request.scale,
        pageMarginTop: 20,
        pageMarginBottom: 20,
        pageMarginLeft: 20,
        pageMarginRight: 40,
        transpose: request.interval,
      });
      if (!tk.loadData(request.xml))
        throw new Error(`Verovio could not read the score: ${tk.getLog()}`);
      const svg = tk.renderToSVG(1);
      const spans = notationSpans(tk.renderToTimemap({ includeMeasures: true }));
      const result: NotationResult = {
        id: request.id,
        svg,
        ...spans,
        ms: Math.round(performance.now() - started),
        error: null,
      };
      self.postMessage(result);
    })
    .catch((error: unknown) => {
      const result: NotationResult = {
        id: request.id,
        svg: '',
        measures: [],
        notes: [],
        ms: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(result);
    });
};
