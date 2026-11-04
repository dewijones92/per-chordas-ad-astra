import type { AnnotationChanges, AnnotationItem, Annotations } from './schemas.ts';

interface Placed {
  page: string;
  item: AnnotationItem;
  json: string;
}

function placed(doc: Annotations): Map<string, Placed> {
  const out = new Map<string, Placed>();
  for (const [page, items] of Object.entries(doc.pages)) {
    for (const item of items) out.set(item.id, { page, item, json: JSON.stringify(item) });
  }
  return out;
}

export function diffAnnotations(before: Annotations, after: Annotations): AnnotationChanges {
  const was = placed(before);
  const now = placed(after);
  const put: Record<string, AnnotationItem[]> = {};
  for (const [id, { page, item, json }] of now) {
    const old = was.get(id);
    if (old?.page === page && old.json === json) continue;
    (put[page] ??= []).push(item);
  }
  const remove = [...was.keys()].filter((id) => !now.has(id));
  return { version: 1, put, remove };
}

export function isNoChange(changes: AnnotationChanges): boolean {
  return changes.remove.length === 0 && Object.keys(changes.put).length === 0;
}

export function applyAnnotationChanges(doc: Annotations, changes: AnnotationChanges): Annotations {
  const incoming = new Map<string, { page: string; item: AnnotationItem }>();
  for (const [page, items] of Object.entries(changes.put)) {
    for (const item of items) incoming.set(item.id, { page, item });
  }
  const gone = new Set(changes.remove);
  const placedIds = new Set<string>();
  const pages: Record<string, AnnotationItem[]> = {};
  for (const [page, items] of Object.entries(doc.pages)) {
    const kept: AnnotationItem[] = [];
    for (const item of items) {
      const next = incoming.get(item.id);
      if (next) {
        if (next.page !== page) continue;
        kept.push(next.item);
        placedIds.add(item.id);
      } else if (!gone.has(item.id)) {
        kept.push(item);
      }
    }
    if (kept.length > 0) pages[page] = kept;
  }
  for (const [id, { page, item }] of incoming) {
    if (placedIds.has(id)) continue;
    (pages[page] ??= []).push(item);
  }
  return { ...doc, pages };
}
