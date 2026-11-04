import { FoundScore, type FoundFile } from '@pcaa/shared';
import { creativeCommonsUrl, isOpenLicence } from './licence.ts';

export const MUTOPIA_NAME = 'Mutopia Project';
const BLOCK = /<table class="table-bordered result-table">([\s\S]*?)<\/table>/g;
const CELL = /<td>([\s\S]*?)<\/td>/g;
const ANCHOR = /<a href="([^"]*)">([\s\S]*?)<\/a>/g;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function plain(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function fileFor(href: string, origin: string): FoundFile | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const name = url.pathname.toLowerCase();
  if (name.endsWith('.pdf')) {
    const paper = name.includes('-a4.') ? 'A4' : name.includes('-let.') ? 'Letter' : '';
    return { ext: 'pdf', url: url.href, label: paper ? `PDF (${paper})` : 'PDF', bytes: null };
  }
  if (name.endsWith('.mid') || name.endsWith('.midi')) {
    return { ext: 'mid', url: url.href, label: 'MIDI', bytes: null };
  }
  if (name.endsWith('.mxl') || name.endsWith('.musicxml')) {
    const ext = name.endsWith('.mxl') ? 'mxl' : 'musicxml';
    return { ext, url: url.href, label: 'MusicXML', bytes: null };
  }
  if (name.endsWith('.mscz'))
    return { ext: 'mscz', url: url.href, label: 'MuseScore', bytes: null };
  return null;
}

const PAPER_ORDER: Readonly<Record<string, number>> = { 'PDF (A4)': 0, PDF: 1, 'PDF (Letter)': 2 };

function parseBlock(inner: string, base: URL): FoundScore | null {
  const cells = [...inner.matchAll(CELL)].map((m) => m[1] ?? '');
  const titleCell = cells[0];
  if (titleCell === undefined) return null;
  const title = plain(titleCell);
  const composer = plain(cells[1] ?? '')
    .replace(/^by\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '');
  const detail = plain(cells[2] ?? '');
  const instrument = plain(cells[4] ?? '').replace(/^for\s+/i, '');
  const anchors = [...inner.matchAll(ANCHOR)].map((m) => ({
    href: decodeEntities(m[1] ?? ''),
    text: plain(m[2] ?? ''),
  }));
  const licenceAnchor = anchors.find((a) => a.href.includes('legal.html'));
  const info = anchors.find((a) => a.href.includes('piece-info.cgi'));
  if (!title || !licenceAnchor || !info) return null;
  const licence = licenceAnchor.text;
  if (!isOpenLicence(licence)) return null;
  const pageUrl = new URL(info.href, `${base.origin}/cgibin/`).href;
  const id = /[?&]id=(\d+)/.exec(info.href)?.[1];
  if (!id) return null;
  const files = anchors
    .map((a) => fileFor(a.href, base.origin))
    .filter((f): f is FoundFile => f !== null)
    .sort((a, b) => (PAPER_ORDER[a.label] ?? 3) - (PAPER_ORDER[b.label] ?? 3));
  const seen = new Set<string>();
  const unique = files.filter((f) => !seen.has(f.url) && seen.add(f.url));
  if (unique.length === 0) return null;
  const parsed = FoundScore.safeParse({
    id: `mutopia:${id}`,
    source: 'mutopia',
    sourceName: MUTOPIA_NAME,
    title,
    composer,
    instrument,
    detail,
    licence,
    licenceUrl: creativeCommonsUrl(licence),
    pageUrl,
    files: unique,
  });
  return parsed.success ? parsed.data : null;
}

export interface Parsed {
  results: FoundScore[];
  hidden: number;
}

export function parseMutopia(html: string, baseUrl: string): Parsed {
  const base = new URL(baseUrl);
  const blocks = [...html.matchAll(BLOCK)];
  const results = blocks
    .map((m) => parseBlock(m[1] ?? '', base))
    .filter((r): r is FoundScore => r !== null);
  return { results, hidden: blocks.length - results.length };
}

export function mutopiaSearchUrl(baseUrl: string, query: string): string {
  const url = new URL('/cgibin/make-table.cgi', baseUrl);
  url.searchParams.set('searchingfor', query);
  return url.href;
}
