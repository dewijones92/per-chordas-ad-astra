export interface NotationRequest {
  id: number;
  xml: string;
  interval: string;
  scale: number;
}

export interface NotationNoteSpan {
  id: string;
  on: number;
  off: number;
}

export interface NotationResult {
  id: number;
  svg: string;
  measures: { id: string; q: number }[];
  notes: NotationNoteSpan[];
  ms: number;
  error: string | null;
}

export function notationSpans(
  entries: readonly { qstamp: number; on?: string[]; off?: string[]; measureOn?: string }[],
): { measures: NotationResult['measures']; notes: NotationNoteSpan[] } {
  const started = new Map<string, number>();
  const notes: NotationNoteSpan[] = [];
  const measures: NotationResult['measures'] = [];
  for (const e of entries) {
    if (e.measureOn) measures.push({ id: e.measureOn, q: e.qstamp });
    for (const id of e.off ?? []) {
      const on = started.get(id);
      if (on !== undefined) {
        notes.push({ id, on, off: e.qstamp });
        started.delete(id);
      }
    }
    for (const id of e.on ?? []) started.set(id, e.qstamp);
  }
  for (const [id, on] of started) notes.push({ id, on, off: on + 0.25 });
  return { measures, notes: notes.sort((a, b) => a.on - b.on) };
}

export function soundingIds(
  notes: readonly NotationNoteSpan[],
  q: number,
  longest: number,
): string[] {
  let lo = 0;
  let hi = notes.length;
  const from = q - longest;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((notes[mid]?.on ?? Infinity) < from) lo = mid + 1;
    else hi = mid;
  }
  const out: string[] = [];
  for (let i = lo; i < notes.length; i++) {
    const n = notes[i];
    if (!n || n.on > q) break;
    if (n.off > q) out.push(n.id);
  }
  return out;
}
