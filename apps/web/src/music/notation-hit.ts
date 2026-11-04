const SLOP_PX = 8;

export function nearestNote(box: Element, x: number, y: number): Element | null {
  let best: Element | null = null;
  let bestDistance = Infinity;
  for (const measure of Array.from(box.querySelectorAll('g.measure'))) {
    const m = measure.getBoundingClientRect();
    if (x < m.left - SLOP_PX || x > m.right + SLOP_PX) continue;
    if (y < m.top - SLOP_PX || y > m.bottom + SLOP_PX) continue;
    for (const head of Array.from(measure.querySelectorAll('g.notehead'))) {
      const b = head.getBoundingClientRect();
      const distance = Math.hypot(
        Math.max(b.left - x, 0, x - b.right),
        Math.max(b.top - y, 0, y - b.bottom),
      );
      if (distance <= SLOP_PX && distance < bestDistance) {
        best = head;
        bestDistance = distance;
      }
    }
  }
  const note = best?.closest('g.note') ?? null;
  console.info('dewidebug notation nearest note', {
    note: note?.id ?? null,
    distance: note ? Math.round(bestDistance) : null,
  });
  return note;
}
