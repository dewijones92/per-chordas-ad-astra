import { newId, type TextItem } from '@pcaa/shared';
import { useState } from 'react';
import type { TextEditRequest } from './AnnotationLayer.tsx';
import type { HistoryAction } from './history.ts';
import { SIZES, type ToolState } from './tools.ts';

interface Editing extends TextEditRequest {
  text: string;
}

export function useTextEditing(
  dispatch: (action: HistoryAction) => void,
  tools: ToolState,
  sizeScale = 1,
) {
  const [editing, setEditing] = useState<Editing | null>(null);

  const commit = () => {
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
        size: SIZES.text[tools.size] * sizeScale,
      };
      dispatch({ type: 'add', page: editing.page, item });
    }
    setEditing(null);
  };

  const start = (request: TextEditRequest) => {
    setEditing({ ...request, text: request.item?.text ?? '' });
  };

  const editor = (
    page: number,
    place: (x: number, y: number) => { left: number; top: number },
    scale: number,
  ) => {
    if (editing?.page !== page) return null;
    const at = place(editing.x, editing.y);
    return (
      <textarea
        className="text-editor"
        autoFocus
        data-testid="text-editor"
        value={editing.text}
        placeholder="Type a note… (Ctrl+Enter to finish)"
        style={{
          left: at.left,
          top: at.top,
          fontSize: (editing.item?.size ?? SIZES.text[tools.size] * sizeScale) * scale,
          color: editing.item?.colour ?? tools.colour,
        }}
        onChange={(e) => {
          setEditing({ ...editing, text: e.target.value });
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') setEditing(null);
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
        }}
      />
    );
  };

  return { start, editor };
}
