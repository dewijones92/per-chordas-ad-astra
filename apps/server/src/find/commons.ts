import { FoundScore, MAX_SCORE_BYTES } from '@pcaa/shared';
import { z } from 'zod';
import { creativeCommonsUrl, isOpenLicence } from './licence.ts';
import type { Parsed } from './mutopia.ts';

export const COMMONS_NAME = 'Wikimedia Commons';
export const COMMONS_LIMIT = 8;

const Page = z.object({
  title: z.string(),
  index: z.number().optional(),
  imageinfo: z
    .array(
      z.object({
        size: z.number().int().nonnegative(),
        pagecount: z.number().int().optional(),
        url: z.string(),
        descriptionurl: z.string(),
        mime: z.string(),
        extmetadata: z
          .object({
            LicenseShortName: z.object({ value: z.string() }).optional(),
            LicenseUrl: z.object({ value: z.string() }).optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

const Response = z.object({
  query: z.object({ pages: z.array(z.unknown()) }).optional(),
});

function titleOf(fileTitle: string): string {
  return fileTitle
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s*\(IA [^)]*\)\s*$/, '')
    .replace(/_/g, ' ')
    .trim();
}

function httpsOnly(href: string | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href).protocol === 'https:' ? href : null;
  } catch {
    return null;
  }
}

export function parseCommons(json: unknown): Parsed {
  const body = Response.safeParse(json);
  if (!body.success) return { results: [], hidden: 0 };
  const pages = (body.data.query?.pages ?? []).flatMap((raw) => {
    const page = Page.safeParse(raw);
    return page.success ? [page.data] : [];
  });
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const results: FoundScore[] = [];
  let hidden = 0;
  for (const page of pages) {
    const info = page.imageinfo[0];
    if (!info) continue;
    const licence = info.extmetadata?.LicenseShortName?.value ?? '';
    const usable =
      info.mime === 'application/pdf' && info.size <= MAX_SCORE_BYTES && isOpenLicence(licence);
    if (!usable) {
      hidden += 1;
      continue;
    }
    const file = new URL(info.url);
    file.search = '';
    const title = titleOf(page.title);
    const pages_ = info.pagecount ?? 0;
    const parsed = FoundScore.safeParse({
      id: `commons:${page.title}`,
      source: 'commons',
      sourceName: COMMONS_NAME,
      title,
      composer: '',
      instrument: '',
      detail: pages_ > 0 ? `${String(pages_)} pages` : '',
      licence,
      licenceUrl: httpsOnly(info.extmetadata?.LicenseUrl?.value) ?? creativeCommonsUrl(licence),
      pageUrl: info.descriptionurl,
      files: [{ ext: 'pdf', url: file.href, label: 'PDF', bytes: info.size }],
    });
    if (parsed.success) results.push(parsed.data);
    else hidden += 1;
  }
  return { results, hidden };
}

export function commonsSearchUrl(apiUrl: string, query: string): string {
  const url = new URL(apiUrl);
  const params: Record<string, string> = {
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:office`,
    gsrlimit: String(COMMONS_LIMIT),
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl',
    formatversion: '2',
    format: 'json',
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}
