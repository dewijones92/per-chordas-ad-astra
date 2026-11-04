import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { AnnotationLayer } from '../annotate/AnnotationLayer.tsx';
import type { History, HistoryAction } from '../annotate/history.ts';
import { useTextEditing } from '../annotate/TextEditor.tsx';
import type { ToolState } from '../annotate/tools.ts';
import { useWheelZoom } from '../score/use-wheel-zoom.ts';
import { wheelLookAhead } from '../score/zoom.ts';
import { geometry } from './falling.ts';
import {
  buildAxis,
  groupOf,
  projectMarks,
  toStoredActions,
  type Projection,
} from './falling-marks.ts';
import type { KeyRange } from './keys.ts';
import type { Performance } from './performance.ts';

export interface FallingMarksState {
  history: History;
  dispatch: (action: HistoryAction) => void;
  tools: ToolState;
  selected: string | null;
  onSelect: (id: string | null) => void;
  editable: boolean;
  onClaim: () => void;
}

interface Props {
  perf: Performance;
  transpose: number;
  range: KeyRange;
  width: number;
  height: number;
  lookAhead: number;
  position: () => number;
  playing: boolean;
  marks: FallingMarksState;
  onScrub: (seconds: number) => void;
  onLookAhead: Dispatch<SetStateAction<number>>;
}

export function FallingMarks(props: Props) {
  const { perf, transpose, range, width, height, lookAhead, position, playing, marks } = props;
  const box = useRef<HTMLDivElement | null>(null);
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const setBox = useCallback((el: HTMLDivElement | null) => {
    box.current = el;
    setBoxEl(el);
  }, []);
  useWheelZoom(boxEl, props.onLookAhead, 'falling notes look-ahead', wheelLookAhead);

  const g = useMemo(
    () => geometry({ width, height, range, lookAhead }),
    [width, height, range, lookAhead],
  );
  const proj = useMemo<Projection>(
    () => ({ axis: buildAxis(g.layout, range), transpose, pxPerSecond: g.pxPerSecond }),
    [g, range, transpose],
  );
  const shown = useMemo(
    () => projectMarks(marks.history.present, perf, proj),
    [marks.history.present, perf, proj],
  );
  const { dispatch: save } = marks;
  const dispatch = useCallback(
    (action: HistoryAction) => {
      const actions = toStoredActions(action, shown, perf, proj);
      console.info('dewidebug falling marks action', {
        type: action.type,
        stored: actions.map((a) => a.type),
      });
      for (const a of actions) save(a);
    },
    [shown, perf, proj, save],
  );
  const textEditing = useTextEditing(dispatch, marks.tools, 1);

  const originAt = useCallback(
    () => -(g.notesHeight + position() * g.pxPerSecond),
    [g.notesHeight, g.pxPerSecond, position],
  );
  const apply = useCallback(() => {
    const el = box.current;
    const svg = el?.querySelector('svg');
    if (!el || !svg) return;
    const origin = originAt();
    svg.setAttribute('viewBox', `0 ${String(origin)} ${String(width)} ${String(g.notesHeight)}`);
    el.dataset['origin'] = origin.toFixed(2);
    el.dataset['position'] = position().toFixed(3);
  }, [originAt, position, width, g.notesHeight]);

  useLayoutEffect(() => {
    apply();
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      apply();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  });

  if (width === 0 || g.notesHeight === 0) return null;
  const origin = originAt();
  return (
    <div
      ref={setBox}
      className={`falling-marks${marks.editable ? ' is-editable' : ''}`}
      style={{ width, height: g.notesHeight }}
      data-testid="falling-marks"
      data-items={Object.values(marks.history.present.pages).reduce((n, l) => n + l.length, 0)}
      data-shown={shown.items.length}
      data-pps={g.pxPerSecond.toFixed(3)}
      onPointerDownCapture={marks.editable ? marks.onClaim : undefined}
      onWheel={(e) => {
        props.onScrub(position() - e.deltaY / Math.max(1, g.pxPerSecond));
      }}
    >
      <AnnotationLayer
        page={0}
        width={width}
        height={g.notesHeight}
        originY={origin}
        scale={1}
        items={shown.items}
        tools={marks.tools}
        dispatch={dispatch}
        selected={marks.selected}
        onSelect={marks.onSelect}
        onEditText={textEditing.start}
        readOnly={!marks.editable}
        groupOf={groupOf}
        testId="falling-layer"
        className="falling-layer"
      />
      {textEditing.editor(0, (x, y) => ({ left: x, top: y - origin }), 1)}
    </div>
  );
}
