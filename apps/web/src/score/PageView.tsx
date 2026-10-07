import type { AnnotationItem } from '@pcaa/shared';
import { useEffect, useRef, useState } from 'react';
import { AnnotationLayer, type TextEditRequest } from '../annotate/AnnotationLayer.tsx';
import type { HistoryAction } from '../annotate/history.ts';
import type { ToolState } from '../annotate/tools.ts';
import type { PDFPageProxy } from './pdf.ts';

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
  children?: React.ReactNode;
}

export function PageView(props: Props) {
  const { page, number, cssWidth } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const base = page.getViewport({ scale: 1 });
  const scale = cssWidth / base.width;
  const cssHeight = base.height * scale;

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '1200px 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas || cssWidth <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const viewport = page.getViewport({ scale: scale * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvas, viewport });
    task.promise.catch((e: unknown) => {
      if (e instanceof Error && e.name === 'RenderingCancelledException') return;
      console.warn('dewidebug pdf page render failed', { page: number, error: String(e) });
    });
    return () => {
      task.cancel();
    };
  }, [visible, page, scale, cssWidth, number]);

  return (
    <div
      ref={holderRef}
      className="page"
      data-page={number}
      style={{ width: cssWidth, height: cssHeight }}
    >
      <canvas
        ref={canvasRef}
        className="page-canvas"
        style={{ width: cssWidth, height: cssHeight }}
      />
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
        onEditText={props.onEditText}
      />
      {props.children}
      <span className="page-number">{number}</span>
    </div>
  );
}
