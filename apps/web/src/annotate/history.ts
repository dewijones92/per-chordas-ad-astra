import type { AnnotationItem, Annotations, PdfImport } from '@pcaa/shared';

export const HISTORY_LIMIT = 200;

export interface History {
  past: Annotations[];
  present: Annotations;
  future: Annotations[];
  group: string | null;
}

export type HistoryAction =
  | { type: 'reset'; doc: Annotations }
  | { type: 'add'; page: number; item: AnnotationItem; group?: string }
  | { type: 'update'; page: number; item: AnnotationItem; group?: string }
  | { type: 'remove'; page: number; ids: readonly string[]; group?: string }
  | { type: 'clear-page'; page: number }
  | { type: 'import'; pages: Annotations['pages']; pdfImport: PdfImport }
  | { type: 'end-group' }
  | { type: 'undo' }
  | { type: 'redo' };

export const initialHistory = (doc: Annotations): History => ({
  past: [],
  present: doc,
  future: [],
  group: null,
});

export function itemsOn(doc: Annotations, page: number): readonly AnnotationItem[] {
  return doc.pages[String(page)] ?? [];
}

function withPage(doc: Annotations, page: number, items: AnnotationItem[]): Annotations {
  const key = String(page);
  const pages = Object.fromEntries(Object.entries(doc.pages).filter(([k]) => k !== key));
  if (items.length > 0) pages[key] = items;
  return { ...doc, pages };
}

function commit(history: History, next: Annotations, group: string | null): History {
  if (next === history.present) return history;
  if (group !== null && group === history.group) {
    return { ...history, present: next, future: [] };
  }
  const past = [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], group };
}

function withImport(
  doc: Annotations,
  pages: Annotations['pages'],
  pdfImport: PdfImport,
): Annotations {
  const present = new Set(Object.values(doc.pages).flatMap((items) => items.map((i) => i.id)));
  const next = { ...doc.pages };
  for (const [page, items] of Object.entries(pages)) {
    const fresh = items.filter((i) => !present.has(i.id));
    if (fresh.length > 0) next[page] = [...fresh, ...(next[page] ?? [])];
  }
  return { ...doc, pages: next, pdfImport };
}

export function historyReducer(history: History, action: HistoryAction): History {
  const doc = history.present;
  switch (action.type) {
    case 'reset':
      return initialHistory(action.doc);
    case 'add':
      return commit(
        history,
        withPage(doc, action.page, [...itemsOn(doc, action.page), action.item]),
        action.group ?? null,
      );
    case 'update': {
      const items = itemsOn(doc, action.page);
      if (!items.some((i) => i.id === action.item.id)) return history;
      return commit(
        history,
        withPage(
          doc,
          action.page,
          items.map((i) => (i.id === action.item.id ? action.item : i)),
        ),
        action.group ?? null,
      );
    }
    case 'remove': {
      const items = itemsOn(doc, action.page);
      const kept = items.filter((i) => !action.ids.includes(i.id));
      if (kept.length === items.length) return history;
      return commit(history, withPage(doc, action.page, kept), action.group ?? null);
    }
    case 'clear-page':
      if (itemsOn(doc, action.page).length === 0) return history;
      return commit(history, withPage(doc, action.page, []), null);
    case 'import': {
      const apply = (d: Annotations) => withImport(d, action.pages, action.pdfImport);
      return {
        ...history,
        past: history.past.map(apply),
        present: apply(history.present),
        future: history.future.map(apply),
      };
    }
    case 'end-group':
      return history.group === null ? history : { ...history, group: null };
    case 'undo': {
      const previous = history.past.at(-1);
      if (previous === undefined) return history;
      return {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
        group: null,
      };
    }
    case 'redo': {
      const [next, ...rest] = history.future;
      if (next === undefined) return history;
      return { past: [...history.past, history.present], present: next, future: rest, group: null };
    }
  }
}
