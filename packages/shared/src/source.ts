import type { PieceSource, SourceEdit } from './schemas.ts';

const KNOWN_SITES: readonly (readonly [domain: string, name: string])[] = [
  ['musescore.com', 'MuseScore'],
  ['mutopiaproject.org', 'Mutopia Project'],
  ['imslp.org', 'IMSLP'],
  ['wikimedia.org', 'Wikimedia Commons'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MAX_COUNT = 1_000_000_000;

export function siteNameFor(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return url.trim().slice(0, 60);
  }
  for (const [domain, name] of KNOWN_SITES) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return host.slice(0, 60);
}

export function parseSourceUrl(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:\/|$))/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname === '') return null;
    return candidate;
  } catch {
    return null;
  }
}

const roundTenth = (n: number) => Math.round(n * 10) / 10;

export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    const shown = k < 10 ? roundTenth(k) : Math.round(k);
    if (shown < 1000) return `${String(shown)}k`;
  }
  const m = n / 1_000_000;
  return `${String(m < 10 ? roundTenth(m) : Math.round(m))}M`;
}

export function parseCount(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?)([kKmM])?$/.exec(text.trim().replaceAll(',', ''));
  const digits = match?.[1];
  if (digits === undefined) return null;
  const suffix = match?.[2]?.toLowerCase();
  if (suffix === undefined && digits.includes('.')) return null;
  const scale = suffix === 'k' ? 1000 : suffix === 'm' ? 1_000_000 : 1;
  const value = Math.round(Number(digits) * scale);
  return Number.isFinite(value) && value <= MAX_COUNT ? value : null;
}

export function parseStars(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const stars = roundTenth(Number(cleaned));
  return stars >= 0 && stars <= 5 ? stars : null;
}

export function formatStars(stars: number): string {
  return stars.toFixed(1);
}

export function formatNotedOn(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  const name = MONTHS[Number(month) - 1] ?? month;
  return `${String(Number(day))} ${name} ${year}`;
}

export const SELF_SEARCH_SITES = ['musescore', 'imslp'] as const;
export type SelfSearchSite = (typeof SELF_SEARCH_SITES)[number];

const SELF_SEARCH: Record<SelfSearchSite, { search: string; param: string; home: string }> = {
  musescore: {
    search: 'https://musescore.com/sheetmusic',
    param: 'text',
    home: 'https://musescore.com/sheetmusic',
  },
  imslp: { search: 'https://imslp.org/index.php', param: 'search', home: 'https://imslp.org/' },
};

export function selfSearchUrl(site: SelfSearchSite, query: string): string {
  const { search, param, home } = SELF_SEARCH[site];
  const q = query.trim();
  if (q === '') return home;
  return `${search}?${new URLSearchParams({ [param]: q }).toString()}`;
}

function sameRating(a: PieceSource['rating'], b: SourceEdit['rating']): boolean {
  return (
    a !== null &&
    b !== null &&
    a.stars === b.stars &&
    a.ratings === b.ratings &&
    a.views === b.views
  );
}

export function applySourceEdit(
  current: PieceSource | undefined,
  edit: SourceEdit,
  today: string,
): PieceSource {
  const sameLink = current?.url === edit.url;
  const before = current?.rating ?? null;
  return {
    name: sameLink ? current.name : siteNameFor(edit.url),
    url: edit.url,
    licence: sameLink ? current.licence : null,
    licenceUrl: sameLink ? current.licenceUrl : null,
    rating:
      edit.rating === null
        ? null
        : sameRating(before, edit.rating) && before
          ? before
          : { ...edit.rating, notedOn: today },
  };
}
