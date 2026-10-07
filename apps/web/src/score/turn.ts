export interface Row {
  top: number;
  height: number;
}

export interface Viewport {
  top: number;
  height: number;
  scrollHeight: number;
}

export const STEP = 0.85;

export function rowsOf(pages: readonly Row[]): Row[] {
  const byTop = new Map<number, number>();
  for (const p of pages) byTop.set(p.top, Math.max(byTop.get(p.top) ?? 0, p.height));
  return [...byTop].map(([top, height]) => ({ top, height })).sort((a, b) => a.top - b.top);
}

export function turnTarget(
  pages: readonly Row[],
  view: Viewport,
  direction: 1 | -1,
  gap: number,
): number {
  const rows = rowsOf(pages);
  if (rows.length === 0) return view.top;
  const maxTop = Math.max(0, view.scrollHeight - view.height);
  const anchor = view.top + gap;
  let index = rows.findLastIndex((r) => r.top <= anchor + 1);
  if (index < 0) index = 0;
  const row = rows[index] ?? { top: 0, height: 0 };
  const rowStart = Math.max(0, row.top - gap / 2);
  const rowEnd = row.top + row.height + gap / 2;
  const viewBottom = view.top + view.height;
  let target: number;
  if (direction > 0) {
    if (rowEnd > viewBottom + 4) {
      target = Math.min(view.top + view.height * STEP, rowEnd - view.height);
    } else {
      const next = rows[index + 1];
      target = next ? next.top - gap / 2 : maxTop;
    }
  } else if (view.top > rowStart + 4) {
    target = Math.max(rowStart, view.top - view.height * STEP);
  } else {
    const previous = rows[index - 1];
    target = previous ? Math.max(0, previous.top - gap / 2) : 0;
  }
  return Math.round(Math.min(maxTop, Math.max(0, target)));
}
