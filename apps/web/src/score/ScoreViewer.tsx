import { newId, type TextItem } from '@pcaa/shared';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import type { TextEditRequest } from '../annotate/AnnotationLayer.tsx';
import { itemsOn, type HistoryAction, type History } from '../annotate/history.ts';
import { SIZES, type ToolState } from '../annotate/tools.ts';
import { openPdf, type PDFPageProxy } from './pdf.ts';
import { PageView } from './PageView.tsx';
import { turnTarget } from './turn.ts';
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
  initialPosition?: ScorePosition | null;
  onPositionChange?: (position: ScorePosition) => void;
}

interface Editing extends TextEditRequest {
  text: string;
}

const PAGE_GAP = 24;
const TURN_SETTLE_MS = 700;

export function ScoreViewer(props: Props) {
  const { url, history, dispatch, tools, zoom, mode, selected, onSelect } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const pendingTurn = useRef<{ top: number; until: number } | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    scroller.current = el;
    setScrollRoot(el);
  }, []);
  const [opened, setOpened] = useState<{
    url: string;
    pages: PDFPageProxy[] | null;
    error: string | null;
  } | null>(null);
  const [available, setAvailable] = useState({ width: 800, height: 900 });
  const [measured, setMeasured] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    openPdf(url).then(
      ({ doc, pages: loaded }) => {
        destroy = () => {
          void doc.loadingTask.destroy();
          console.info('dewidebug pdf closed', { url, pages: loaded.length });
        };
        if (cancelled) {
          destroy();
          return;
        }
        setOpened({ url, pages: loaded, error: null });
      },
      (e: unknown) => {
        if (!cancelled)
          setOpened({ url, pages: null, error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);
  const pages = opened?.url === url ? opened.pages : null;
  const error = opened?.url === url ? opened.error : null;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setAvailable({ width: el.clientWidth - 48, height: el.clientHeight - 56 });
      setMeasured(true);
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

  const positionOf = (): ScorePosition | null => {
    const el = scroller.current;
    if (!el || !pages) return null;
    const atBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 2;
    const top = el.scrollTop + (atBottom ? el.clientHeight / 2 : PAGE_GAP);
    const elements = pageElements();
    const current = [...elements].reverse().find((p) => p.offsetTop <= top) ?? elements[0];
    if (!current) return null;
    const number = Number(current.dataset['page']);
    const page = pages[number - 1];
    if (!page) return null;
    const scale = cssWidth / page.getViewport({ scale: 1 }).width;
    const anchor = el.scrollTop + PAGE_GAP;
    return { page: number, y: Math.max(0, Math.round((anchor - current.offsetTop) / scale)) };
  };

  const scrollToPosition = ({ page, y }: ScorePosition, behavior: ScrollBehavior): boolean => {
    const el = scroller.current;
    const target = pageElements().find((p) => Number(p.dataset['page']) === page);
    const proxy = pages?.[page - 1];
    if (!el || !target || !proxy) return false;
    const scale = cssWidth / proxy.getViewport({ scale: 1 }).width;
    el.scrollTo({ top: target.offsetTop + y * scale - PAGE_GAP, behavior });
    return true;
  };

  useImperativeHandle(props.handleRef, () => ({
    turn(direction) {
      const el = scroller.current;
      if (!el) return;
      const rows = pageElements().map((p) => ({ top: p.offsetTop, height: p.offsetHeight }));
      const pending = pendingTurn.current;
      const inFlight = pending !== null && performance.now() < pending.until;
      const from = inFlight ? pending.top : el.scrollTop;
      const view = { top: from, height: el.clientHeight, scrollHeight: el.scrollHeight };
      const top = turnTarget(rows, view, direction, PAGE_GAP);
      pendingTurn.current = { top, until: performance.now() + TURN_SETTLE_MS };
      console.info('dewidebug score turn', { direction, from, to: top, inFlight, mode });
      el.scrollTo({ top, behavior: 'smooth' });
    },
    position: positionOf,
    goTo(position) {
      scrollToPosition(position, 'smooth');
    },
  }));

  const lastPosition = useRef<ScorePosition | null>(null);
  const restoreTo = useEffectEvent(() => {
    const target = lastPosition.current ?? props.initialPosition ?? null;
    if (!target) return;
    const done = scrollToPosition(target, 'instant');
    console.info('dewidebug score restore position', { target, done, cssWidth, mode });
  });
  const report = useEffectEvent(() => {
    const position = positionOf();
    if (!position) return;
    lastPosition.current = position;
    props.onPositionChange?.(position);
  });

  const ready = pages !== null && measured;
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      restoreTo();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [ready, cssWidth]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !ready) return;
    let timer: number | undefined;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        report();
      }, 300);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
    };
  }, [ready]);

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
      ref={attachScroller}
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
            scrollRoot={scrollRoot}
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
