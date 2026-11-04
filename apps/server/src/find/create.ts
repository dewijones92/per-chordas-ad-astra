import type { Config } from '../config.ts';
import type { Logger } from '../log.ts';
import type { DataRepo } from '../store/data-repo.ts';
import { PoliteFetch } from './polite-fetch.ts';
import { allowedOriginsOf, FindService } from './service.ts';

export const REPO_URL = 'https://github.com/dewijones92/per-chordas-ad-astra';

export function createFindService(
  config: Pick<
    Config,
    | 'APP_VERSION'
    | 'FIND_MUTOPIA_BASE'
    | 'FIND_COMMONS_API'
    | 'FIND_COMMONS_FILE_ORIGIN'
    | 'FIND_MIN_GAP_MS'
    | 'FIND_TIMEOUT_MS'
  >,
  repo: DataRepo,
  log: Logger,
  fetchImpl?: typeof fetch,
): FindService {
  const origins = {
    mutopiaBase: config.FIND_MUTOPIA_BASE,
    commonsApi: config.FIND_COMMONS_API,
    commonsFileOrigin: config.FIND_COMMONS_FILE_ORIGIN,
  };
  const allowed = allowedOriginsOf(origins);
  const child = log.child({ component: 'find' });
  const http = new PoliteFetch({
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    userAgent: `per-chordas-ad-astra/${config.APP_VERSION} (personal practice app, one user; ${REPO_URL})`,
    minGapMs: config.FIND_MIN_GAP_MS,
    timeoutMs: config.FIND_TIMEOUT_MS,
    allowed: (url) => allowed.has(url.origin),
    log: child,
  });
  child.info(
    { origins: [...allowed], minGapMs: config.FIND_MIN_GAP_MS },
    'dewidebug find ready: these are the only sites it will fetch from',
  );
  return new FindService({ repo, http, origins, log: child });
}
