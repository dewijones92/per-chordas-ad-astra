import {
  COMMONS_FILE_ORIGIN,
  commonsResponse,
  makeMidi,
  makePdf,
  MUTOPIA_ORIGIN,
  mutopiaListing,
  PIANO_WALTZ,
} from '@pcaa/fixtures';
import { createFindService } from '../src/find/create.ts';
import type { FindService } from '../src/find/service.ts';
import type { DataRepo } from '../src/store/data-repo.ts';
import { silentLog } from './helpers.ts';

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
export const OP9_NO1 = `${MUTOPIA_ORIGIN}/ftp/ChopinFF/O9/nocturne_in_b-flat_minor/nocturne_in_b-flat_minor`;
export const OP9_PDF = `${OP9_NO1}-a4.pdf`;
export const OP9_MIDI = `${OP9_NO1}.mid`;
export const OP9_FILES = {
  pdf: makePdf(['Nocturne Op. 9 No. 1 page 1']),
  midi: makeMidi(PIANO_WALTZ),
};

export type Handler = (url: URL) => Response | Promise<Response> | undefined;

export interface Stub {
  fetch: typeof fetch;
  calls: { url: string; userAgent: string | null }[];
}

export function bytesResponse(
  bytes: Uint8Array,
  type: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: { 'content-type': type, ...headers },
  });
}

export function defaultRoutes(url: URL): Response | undefined {
  const at = `${url.origin}${url.pathname}`;
  if (at === `${MUTOPIA_ORIGIN}/cgibin/make-table.cgi`) {
    return new Response(mutopiaListing(), { headers: { 'content-type': 'text/html' } });
  }
  if (at === COMMONS_API) {
    return new Response(commonsResponse(), { headers: { 'content-type': 'application/json' } });
  }
  if (at === OP9_PDF) return bytesResponse(OP9_FILES.pdf, 'application/pdf');
  if (at === OP9_MIDI) return bytesResponse(OP9_FILES.midi, 'audio/sp-midi');
  return undefined;
}

export function stubFetch(handler: Handler = defaultRoutes): Stub {
  const calls: Stub['calls'] = [];
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    calls.push({ url: url.href, userAgent: headers.get('user-agent') });
    return Promise.resolve(handler(url) ?? new Response('not stubbed', { status: 404 }));
  };
  return { fetch: impl, calls };
}

export function findFor(repo: DataRepo, stub: Stub): FindService {
  return createFindService(
    {
      APP_VERSION: 'test',
      FIND_MUTOPIA_BASE: MUTOPIA_ORIGIN,
      FIND_COMMONS_API: COMMONS_API,
      FIND_COMMONS_FILE_ORIGIN: COMMONS_FILE_ORIGIN,
      FIND_MIN_GAP_MS: 0,
      FIND_TIMEOUT_MS: 5_000,
    },
    repo,
    silentLog,
    stub.fetch,
  );
}
