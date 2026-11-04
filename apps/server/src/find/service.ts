import {
  chooseImportFiles,
  extensionOf,
  FIND_QUERY_MAX,
  FIND_QUERY_MIN,
  FindSearchResponse,
  importFilename,
  MAX_MUSIC_BYTES,
  MAX_SCORE_BYTES,
  MUSIC_EXTENSIONS,
  sourceOf,
  type FindImported,
  type FindImportResponse,
  type FindSkipped,
  type FindSourceId,
  type FindSourceStatus,
  type FoundFile,
  type FoundScore,
} from '@pcaa/shared';
import type { Logger } from '../log.ts';
import { musicHeadProblem, RejectedError, type DataRepo } from '../store/data-repo.ts';
import { COMMONS_NAME, commonsSearchUrl, parseCommons } from './commons.ts';
import { MUTOPIA_NAME, mutopiaSearchUrl, parseMutopia, type Parsed } from './mutopia.ts';
import type { PoliteFetch } from './polite-fetch.ts';
import { UpstreamError, type FetchedBody } from './polite-fetch.ts';
import { TtlCache } from './ttl-cache.ts';

export interface FindOrigins {
  mutopiaBase: string;
  commonsApi: string;
  commonsFileOrigin: string;
}

export function allowedOriginsOf(origins: FindOrigins): Set<string> {
  return new Set([
    new URL(origins.mutopiaBase).origin,
    new URL(origins.commonsApi).origin,
    new URL(origins.commonsFileOrigin).origin,
  ]);
}

export interface FindServiceDeps {
  repo: DataRepo;
  http: PoliteFetch;
  origins: FindOrigins;
  log: Logger;
  now?: () => number;
}

const SEARCH_TTL_MS = 10 * 60_000;
const FILE_TTL_MS = 10 * 60_000;
const FILE_CACHE_MAX_BYTES = 8 * 1024 * 1024;
const PAGE_LIMIT_BYTES = 2 * 1024 * 1024;

export interface MusicDownload {
  bytes: Uint8Array;
  name: string;
}

export class FindService {
  private readonly searches: TtlCache<Parsed>;
  private readonly files: TtlCache<FetchedBody>;

  constructor(private readonly deps: FindServiceDeps) {
    const now = deps.now ?? Date.now;
    this.searches = new TtlCache(SEARCH_TTL_MS, 50, now);
    this.files = new TtlCache(FILE_TTL_MS, 6, now);
  }

  async search(rawQuery: string): Promise<FindSearchResponse> {
    const query = rawQuery.replace(/\s+/g, ' ').trim();
    if (query.length < FIND_QUERY_MIN || query.length > FIND_QUERY_MAX) {
      throw new RejectedError(
        `Search for between ${String(FIND_QUERY_MIN)} and ${String(FIND_QUERY_MAX)} characters`,
      );
    }
    const { log } = this.deps;
    log.info({ query }, 'dewidebug find search asked');
    const [mutopia, commons] = await Promise.all([
      this.searchOne('mutopia', MUTOPIA_NAME, query, async () =>
        parseMutopia(
          new TextDecoder().decode(
            (
              await this.deps.http.get(mutopiaSearchUrl(this.deps.origins.mutopiaBase, query), {
                accept: 'text/html',
                maxBytes: PAGE_LIMIT_BYTES,
              })
            ).bytes,
          ),
          this.deps.origins.mutopiaBase,
        ),
      ),
      this.searchOne('commons', COMMONS_NAME, query, async () => {
        const body = await this.deps.http.get(
          commonsSearchUrl(this.deps.origins.commonsApi, query),
          { accept: 'application/json', maxBytes: PAGE_LIMIT_BYTES },
        );
        try {
          return parseCommons(JSON.parse(new TextDecoder().decode(body.bytes)));
        } catch {
          throw new UpstreamError('Wikimedia Commons sent an answer this app could not read');
        }
      }),
    ]);
    const response = FindSearchResponse.parse({
      query,
      results: [...mutopia.results, ...commons.results],
      sources: [mutopia.status, commons.status],
    });
    log.info(
      {
        query,
        results: response.results.length,
        sources: response.sources.map((s) => ({
          source: s.source,
          ok: s.ok,
          count: s.count,
          hidden: s.hidden,
          error: s.error,
        })),
      },
      'dewidebug find search answered',
    );
    return response;
  }

  private async searchOne(
    source: FindSourceId,
    name: string,
    query: string,
    run: () => Promise<Parsed>,
  ): Promise<{ results: FoundScore[]; status: FindSourceStatus }> {
    const key = `${source}:${query.toLowerCase()}`;
    const cached = this.searches.get(key);
    if (cached) {
      this.deps.log.info(
        { source, query, results: cached.results.length },
        'dewidebug find search served from cache, the site was not asked',
      );
      return { results: cached.results, status: statusOf(source, name, cached, null) };
    }
    try {
      const parsed = await run();
      this.searches.set(key, parsed);
      return { results: parsed.results, status: statusOf(source, name, parsed, null) };
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      return {
        results: [],
        status: statusOf(source, name, { results: [], hidden: 0 }, error.message),
      };
    }
  }

  async music(url: string): Promise<MusicDownload> {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    const ext = extensionOf(name);
    if (!(MUSIC_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new RejectedError('That address is not a MuseScore, MusicXML or MIDI file');
    }
    const cached = this.files.get(url);
    if (cached) {
      this.deps.log.info(
        { url, bytes: cached.bytes.byteLength },
        'dewidebug find file served from cache, the site was not asked',
      );
      return { bytes: cached.bytes, name };
    }
    const body = await this.deps.http.get(url, { accept: '*/*', maxBytes: MAX_MUSIC_BYTES });
    const problem = musicHeadProblem(name, body.bytes.subarray(0, 16));
    if (problem) {
      this.deps.log.warn(
        { url, contentType: body.contentType },
        'dewidebug find file is not the kind it claimed',
      );
      throw new UpstreamError(`${new URL(url).host} did not send a real ${ext} file`);
    }
    if (body.bytes.byteLength <= FILE_CACHE_MAX_BYTES) this.files.set(url, body);
    return { bytes: body.bytes, name };
  }

  async importScore(result: FoundScore): Promise<FindImportResponse> {
    const { log, repo, http } = this.deps;
    const choice = chooseImportFiles(result.files);
    log.info(
      {
        id: result.id,
        title: result.title,
        score: choice.score?.url ?? null,
        music: choice.music?.url ?? null,
      },
      'dewidebug find import asked',
    );
    const skipped: FindSkipped[] = [];
    const ready: { file: FoundFile; kind: 'score' | 'music'; bytes: Uint8Array }[] = [];
    const attempt = async (
      file: FoundFile | null,
      kind: 'score' | 'music',
      download: (f: FoundFile) => Promise<Uint8Array>,
    ) => {
      if (!file) return;
      try {
        ready.push({ file, kind, bytes: await download(file) });
      } catch (error) {
        if (!(error instanceof UpstreamError) && !(error instanceof RejectedError)) throw error;
        log.warn(
          { url: file.url, reason: error.message },
          'dewidebug find import: file could not be fetched',
        );
        skipped.push({ label: file.label, reason: error.message });
      }
    };
    await attempt(choice.score, 'score', async (f) => {
      const body = await http.get(f.url, { accept: 'application/pdf', maxBytes: MAX_SCORE_BYTES });
      return body.bytes;
    });
    await attempt(choice.music, 'music', async (f) => (await this.music(f.url)).bytes);
    if (ready.length === 0) {
      const first = skipped[0]?.reason ?? 'This result has no file the app can import';
      throw new UpstreamError(first);
    }

    const piece = await repo.createPiece({
      title: result.title,
      artist: result.composer,
      source: sourceOf(result),
    });
    const imported: FindImported[] = [];
    for (const item of ready) {
      const name = importFilename(result, item.file);
      const blob = new Blob([item.bytes]);
      try {
        if (item.kind === 'score') await repo.addScore(piece.id, name, blob);
        else await repo.addMusic(piece.id, name, blob);
        imported.push({ ext: item.file.ext, label: item.file.label });
      } catch (error) {
        if (!(error instanceof RejectedError)) throw error;
        log.warn(
          { id: piece.id, file: name, reason: error.message },
          'dewidebug find import: the library refused a downloaded file',
        );
        skipped.push({ label: item.file.label, reason: error.message });
      }
    }
    if (imported.length === 0) {
      await repo.deletePiece(piece.id);
      log.warn(
        { id: piece.id },
        'dewidebug find import: nothing could be stored, so the new piece was removed again',
      );
      throw new RejectedError(skipped[0]?.reason ?? 'Nothing could be imported');
    }
    log.info(
      { id: piece.id, imported, skipped, licence: result.licence, from: result.pageUrl },
      'dewidebug find import done',
    );
    return { piece: await repo.getPiece(piece.id), imported, skipped };
  }
}

function statusOf(
  source: FindSourceId,
  name: string,
  parsed: Parsed,
  error: string | null,
): FindSourceStatus {
  return {
    source,
    name,
    ok: error === null,
    count: parsed.results.length,
    hidden: parsed.hidden,
    error,
  };
}
