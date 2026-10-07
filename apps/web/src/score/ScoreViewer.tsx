import { newId, type TextItem } from '@pcaa/shared';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { TextEditRequest } from '../annotate/AnnotationLayer.tsx';
import { itemsOn, type HistoryAction, type History } from '../annotate/history.ts';
import { SIZES, type ToolState } from '../annotate/tools.ts';
import { openPdf, type PDFPageProxy } from './pdf.ts';
import { PageView } from './PageView.tsx';
import './score.css';

export type ViewMode = 'page' | 'spread' | 'width';

export interface ScorePosition {
  page: number;
  y: number;
}

export interface ScoreViewerHandle {
  turn: (direction: 1 | -1) => void;
  position: () => ScorePosition | null;
  goTo: (position: ScorePosition) => void;
}

interface Props {
  url: string;
  history: History;
  dispatch: (action: HistoryAction) => void;
  tools: ToolState;
  zoom: number;
  mode: ViewMode;
  selected: string | null;
  onSelect: (id: string | null) => void;
  handleRef: Ref<ScoreViewerHandle>;
}

interface Editing extends TextEditRequest {
  text: string;
}

const PAGE_GAP = 24;

export function ScoreViewer(props: Props) {
  const { url, history, dispatch, tools, zoom, mode, selected, onSelect } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<{
    url: string;
    pages: PDFPageProxy[] | null;
    error: string | null;
  } | null>(null);
  const [available, setAvailable] = useState({ width: 800, height: 900 });
  const [editing, setEditing] = useState<Editing | null>(null);

  useEffect(() => {
    let cancelled = false;
    openPdf(url).then(
      ({ pages: loaded }) => {
        if (!cancelled) setOpened({ url, pages: loaded, error: null });
      },
      (e: unknown) => {
        if (!cancelled)
          setOpened({ url, pages: null, error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);
  const pages = opened?.url === url ? opened.pages : null;
  const error = opened?.url === url ? opened.error : null;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setAvailable({ width: el.clientWidth - 48, height: el.clientHeight - 56 });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const firstPage = pages?.[0]?.getViewport({ scale: 1 });
  const aspect = firstPage ? firstPage.height / firstPage.width : Math.SQRT2;
  const fitted =
    mode === 'width'
      ? Math.min(available.width, 1100)
      : mode === 'spread'
        ? Math.min((available.width - PAGE_GAP) / 2, available.height / aspect)
        : Math.min(available.width, available.height / aspect);
  const cssWidth = Math.max(200, Math.round(fitted * zoom));

  const pageElements = (): HTMLElement[] =>
    scroller.current ? [...scroller.current.querySelectorAll<HTMLElement>('.page')] : [];

  useImperativeHandle(props.handleRef, () => ({
    turn(direction) {
      const el = scroller.current;
      if (!el) return;
      const top = el.scrollTop;
      const elements = pageElements();
      const target =
        direction > 0
          ? elements.find((p) => p.offsetTop > top + 4)
          : [...elements].reverse().find((p) => p.offsetTop < top - 4);
      el.scrollTo({
        top: target ? target.offsetTop - PAGE_GAP / 2 : direction > 0 ? el.scrollHeight : 0,
        behavior: 'smooth',
      });
    },
    position() {
      const el = scroller.current;
      if (!el || !pages) return null;
      const top = el.scrollTop + PAGE_GAP;
      const elements = pageElements();
      const current = [...elements].reverse().find((p) => p.offsetTop <= top) ?? elements[0];
      if (!current) return null;
      const number = Number(current.dataset['page']);
      const page = pages[number - 1];
      if (!page) return null;
      const scale = cssWidth / page.getViewport({ scale: 1 }).width;
      return { page: number, y: Math.max(0, Math.round((top - current.offsetTop) / scale)) };
    },
    goTo({ page, y }) {
      const el = scroller.current;
      const target = pageElements().find((p) => Number(p.dataset['page']) === page);
      const proxy = pages?.[page - 1];
      if (!el || !target || !proxy) return;
      const scale = cssWidth / proxy.getViewport({ scale: 1 }).width;
      el.scrollTo({ top: target.offsetTop + y * scale - PAGE_GAP, behavior: 'smooth' });
    },
  }));

  const commitText = () => {
    if (!editing) return;
    const text = editing.text.replace(/\s+$/, '');
    if (editing.item) {
      if (text === '') dispatch({ type: 'remove', page: editing.page, ids: [editing.item.id] });
      else if (text !== editing.item.text)
        dispatch({ type: 'update', page: editing.page, item: { ...editing.item, text } });
    } else if (text !== '') {
      const item: TextItem = {
        kind: 'text',
        id: newId(),
        colour: tools.colour,
        x: editing.x,
        y: editing.y,
        text,
        size: SIZES.text[tools.size],
      };
      dispatch({ type: 'add', page: editing.page, item });
    }
    setEditing(null);
  };

  if (error) return <div className="score-message error">Could not open this PDF: {error}</div>;

  return (
    <div
      className={`score-scroller mode-${mode}`}
      ref={scroller}
      data-testid="score-scroller"
      data-mode={mode}
    >
      {!pages && <div className="score-message">Opening score…</div>}
      {pages?.map((page, index) => {
        const number = index + 1;
        const base = page.getViewport({ scale: 1 });
        const scale = cssWidth / base.width;
        return (
          <PageView
            key={number}
            page={page}
            number={number}
            cssWidth={cssWidth}
            items={itemsOn(history.present, number)}
            tools={tools}
            dispatch={dispatch}
            selected={selected}
            onSelect={onSelect}
            onEditText={(request) => {
              setEditing({ ...request, text: request.item?.text ?? '' });
            }}
          >
            {editing?.page === number && (
              <textarea
                className="text-editor"
                autoFocus
                data-testid="text-editor"
                value={editing.text}
                placeholder="Type a note… (Ctrl+Enter to finish)"
                style={{
                  left: editing.x * scale,
                  top: editing.y * scale,
                  fontSize: (editing.item?.size ?? SIZES.text[tools.size]) * scale,
                  color: editing.item?.colour ?? tools.colour,
                }}
                onChange={(e) => {
                  setEditing({ ...editing, text: e.target.value });
                }}
                onBlur={commitText}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') setEditing(null);
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitText();
                }}
              />
            )}
          </PageView>
        );
      })}
    </div>
  );
}
