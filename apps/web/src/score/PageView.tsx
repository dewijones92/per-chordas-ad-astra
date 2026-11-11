import type { AnnotationItem, QuarterTurn } from '@pcaa/shared';
import { useEffect, useRef, useState } from 'react';
import { AnnotationLayer, type TextEditRequest } from '../annotate/AnnotationLayer.tsx';
import type { HistoryAction } from '../annotate/history.ts';
import type { ToolState } from '../annotate/tools.ts';
import { strings, tips } from '../strings.ts';
import { annotationMode, turnedViewport, turnTransform, type PDFPageProxy } from './pdf.ts';

interface Props {
  page: PDFPageProxy;
  number: number;
  cssWidth: number;
  items: readonly AnnotationItem[];
  tools: ToolState;
  dispatch: (action: HistoryAction) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onEditText: (request: TextEditRequest) => void;
  scrollRoot: HTMLElement | null;
  readOnly: boolean;
  hidePdfAnnotations: boolean;
  turn: QuarterTurn;
  onTurn?: (page: number) => void;
  children?: React.ReactNode;
}

export function PageView(props: Props) {
  const { page, number, cssWidth, hidePdfAnnotations, turn } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const base = page.getViewport({ scale: 1 });
  const shown = turnedViewport(page, turn, 1);
  const scale = cssWidth / shown.width;
  const cssHeight = shown.height * scale;

  const { scrollRoot } = props;
  useEffect(() => {
    const el = holderRef.current;
    if (!el || !scrollRoot) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) setVisible(entry.isIntersecting);
      },
      { root: scrollRoot, rootMargin: '150% 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [scrollRoot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth <= 0) return;
    if (!visible) {
      if (canvas.width > 0) {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
      return;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const viewport = turnedViewport(page, turn, scale * ratio);
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const mode = annotationMode(hidePdfAnnotations);
    const task = page.render(
      mode === undefined ? { canvas, viewport } : { canvas, viewport, annotationMode: mode },
    );
    task.promise.catch((e: unknown) => {
      if (e instanceof Error && e.name === 'RenderingCancelledException') return;
      console.warn('dewidebug pdf page render failed', { page: number, error: String(e) });
    });
    return () => {
      task.cancel();
    };
  }, [visible, page, scale, cssWidth, number, hidePdfAnnotations, turn]);

  return (
    <div
      ref={holderRef}
      className="page"
      data-page={number}
      data-pdf-annotations={hidePdfAnnotations ? 'hidden' : 'shown'}
      data-turn={turn}
      style={{ width: cssWidth, height: cssHeight }}
    >
      <canvas
        ref={canvasRef}
        className="page-canvas"
        style={{ width: cssWidth, height: cssHeight }}
      />
      <div
        className="page-layer"
        style={{
          width: base.width * scale,
          height: base.height * scale,
          transform: turnTransform(turn, base.width * scale, base.height * scale),
        }}
      >
        <AnnotationLayer
          page={number}
          width={base.width}
          height={base.height}
          scale={scale}
          items={props.items}
          tools={props.tools}
          dispatch={props.dispatch}
          selected={props.selected}
          onSelect={props.onSelect}
          readOnly={props.readOnly}
          onEditText={props.onEditText}
        />
        {props.children}
      </div>
      {props.onTurn && (
        <button
          type="button"
          className="btn small ghost page-turn"
          title={tips.piece.turnPage}
          data-testid={`turn-page-${String(number)}`}
          onClick={() => {
            props.onTurn?.(number);
          }}
        >
          {strings.score.turnPage}
        </button>
      )}
      <span className="page-number">{number}</span>
    </div>
  );
}
