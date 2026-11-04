import { z } from 'zod';
import { MUSIC_EXTENSIONS, SCORE_EXTENSIONS } from './files.ts';
import type { PieceSource } from './schemas.ts';
import { Piece } from './schemas.ts';

export const FIND_SOURCES = ['mutopia', 'commons'] as const;
export const FindSourceId = z.enum(FIND_SOURCES);
export type FindSourceId = z.infer<typeof FindSourceId>;

export const FIND_QUERY_MIN = 2;
export const FIND_QUERY_MAX = 100;

export const FoundFile = z.object({
  ext: z.enum([...SCORE_EXTENSIONS, ...MUSIC_EXTENSIONS]),
  url: z.url(),
  label: z.string().min(1).max(60),
  bytes: z.int().min(0).nullable(),
});
export type FoundFile = z.infer<typeof FoundFile>;

export const FoundScore = z.object({
  id: z.string().min(1).max(200),
  source: FindSourceId,
  sourceName: z.string().min(1).max(60),
  title: z.string().trim().min(1).max(200),
  composer: z.string().trim().max(200),
  instrument: z.string().trim().max(100),
  detail: z.string().trim().max(200),
  licence: z.string().trim().min(1).max(100),
  licenceUrl: z.url().nullable(),
  pageUrl: z.url(),
  files: z.array(FoundFile).min(1).max(20),
});
export type FoundScore = z.infer<typeof FoundScore>;

export const FindSourceStatus = z.object({
  source: FindSourceId,
  name: z.string(),
  ok: z.boolean(),
  count: z.int().min(0),
  hidden: z.int().min(0),
  error: z.string().nullable(),
});
export type FindSourceStatus = z.infer<typeof FindSourceStatus>;

export const FindSearchResponse = z.object({
  query: z.string(),
  results: z.array(FoundScore),
  sources: z.array(FindSourceStatus),
});
export type FindSearchResponse = z.infer<typeof FindSearchResponse>;

export const FindImportRequest = z.object({ result: FoundScore });
export type FindImportRequest = z.infer<typeof FindImportRequest>;

export const FindImported = z.object({ ext: z.string(), label: z.string() });
export type FindImported = z.infer<typeof FindImported>;

export const FindSkipped = z.object({ label: z.string(), reason: z.string() });
export type FindSkipped = z.infer<typeof FindSkipped>;

export const FindImportResponse = z.object({
  piece: Piece,
  imported: z.array(FindImported),
  skipped: z.array(FindSkipped),
});
export type FindImportResponse = z.infer<typeof FindImportResponse>;

const MUSIC_PREFERENCE = ['mxl', 'musicxml', 'mscz', 'mscx', 'mid', 'midi'] as const;

export interface ImportChoice {
  score: FoundFile | null;
  music: FoundFile | null;
}

export function chooseImportFiles(files: readonly FoundFile[]): ImportChoice {
  const score = files.find((f) => (SCORE_EXTENSIONS as readonly string[]).includes(f.ext)) ?? null;
  let music: FoundFile | null = null;
  for (const ext of MUSIC_PREFERENCE) {
    music = files.find((f) => f.ext === ext) ?? null;
    if (music) break;
  }
  return { score, music };
}

export function sourceOf(result: FoundScore): PieceSource {
  return {
    name: result.sourceName,
    url: result.pageUrl,
    licence: result.licence,
    licenceUrl: result.licenceUrl,
    rating: null,
  };
}

export function importFilename(result: FoundScore, file: FoundFile): string {
  return `${result.title}.${file.ext}`;
}
