export function childElements(el: Element): Element[] {
  return Array.from(el.children);
}

export function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.tagName === name) return c;
  return null;
}

export function childrenNamed(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.tagName === name);
}

export function text(el: Element | null): string {
  return el?.textContent.trim() ?? '';
}

export function childText(el: Element, name: string): string {
  return text(child(el, name));
}

export function childNumber(el: Element, name: string): number | null {
  const raw = childText(el, name);
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseFraction(raw: string): number | null {
  const m = /^\s*(-?\d+)\s*\/\s*(\d+)\s*$/.exec(raw);
  if (!m) return null;
  const den = Number(m[2]);
  return den === 0 ? null : Number(m[1]) / den;
}

export function parseXml(source: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(`Not valid XML: ${(error.textContent || '').trim().slice(0, 160)}`);
  return doc;
}
