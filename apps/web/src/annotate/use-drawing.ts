import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { History, HistoryAction } from './history.ts';
import { ownsKey } from '../ui/shortcuts.ts';
import { defaultToolState, TOOL_KEYS, type ToolState } from './tools.ts';

export type DrawingSurface = 'score' | 'notation' | 'falling';

export type SharedTools = readonly [ToolState, Dispatch<SetStateAction<ToolState>>];

let claimed: DrawingSurface | null = null;
const watchers = new Set<() => void>();

export function claimDrawing(surface: DrawingSurface | null): void {
  if (claimed === surface) return;
  console.info('dewidebug drawing surface', { from: claimed, to: surface });
  claimed = surface;
  for (const watcher of watchers) watcher();
}

export function releaseScore(why: string): void {
  if (claimed !== 'score') return;
  console.info('dewidebug keys leave the score', { why });
  claimDrawing(null);
}

export function drawingClaimed(): boolean {
  return claimed !== null;
}

export function claimedSurface(): DrawingSurface | null {
  return claimed;
}

function watch(onChange: () => void): () => void {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

export function useClaimedSurface(): DrawingSurface | null {
  return useSyncExternalStore(watch, claimedSurface);
}

function owns(surface: DrawingSurface): boolean {
  return claimed === surface || (claimed === null && surface === 'score');
}

export function useDrawing(
  surface: DrawingSurface,
  history: History,
  dispatch: (action: HistoryAction) => void,
  enabled = true,
  shared?: SharedTools,
) {
  const own = useState<ToolState>(defaultToolState);
  const [tools, setTools] = shared ?? own;
  const [selected, setSelected] = useState<string | null>(null);

  const selectedPage = selected
    ? Object.entries(history.present.pages).find(([, items]) =>
        items.some((i) => i.id === selected),
      )?.[0]
    : undefined;
  const deleteSelected = useMemo(
    () =>
      selected && selectedPage
        ? () => {
            dispatch({ type: 'remove', page: Number(selectedPage), ids: [selected] });
            setSelected(null);
          }
        : null,
    [selected, selectedPage, dispatch],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!owns(surface) || ownsKey(e.target, e.key)) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && deleteSelected) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelected(null);
      } else if (TOOL_KEYS[key]) {
        const tool = TOOL_KEYS[key];
        setTools((t) => ({ ...t, tool }));
        if (tool !== 'select') setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [surface, enabled, dispatch, deleteSelected, setTools]);

  const toolbar = {
    tools,
    onChange: (patch: Partial<ToolState>) => {
      setTools((t) => ({ ...t, ...patch }));
      if (patch.tool && patch.tool !== 'select') setSelected(null);
    },
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    onUndo: () => {
      dispatch({ type: 'undo' });
    },
    onRedo: () => {
      dispatch({ type: 'redo' });
    },
    onDeleteSelected: deleteSelected,
  };

  return { tools, selected, setSelected, toolbar };
}
