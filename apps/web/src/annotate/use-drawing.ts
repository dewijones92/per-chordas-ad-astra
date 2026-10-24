import { useEffect, useMemo, useState } from 'react';
import type { History, HistoryAction } from './history.ts';
import { defaultToolState, isTypingTarget, TOOL_KEYS, type ToolState } from './tools.ts';

export type DrawingSurface = 'score' | 'notation';

let claimed: DrawingSurface | null = null;

export function claimDrawing(surface: DrawingSurface | null): void {
  if (claimed !== surface)
    console.info('dewidebug drawing surface', { from: claimed, to: surface });
  claimed = surface;
}

function owns(surface: DrawingSurface): boolean {
  return claimed === surface || (claimed === null && surface === 'score');
}

export function useDrawing(
  surface: DrawingSurface,
  history: History,
  dispatch: (action: HistoryAction) => void,
  enabled = true,
) {
  const [tools, setTools] = useState<ToolState>(defaultToolState);
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
      if (!owns(surface) || isTypingTarget(e.target)) return;
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
  }, [surface, enabled, dispatch, deleteSelected]);

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
