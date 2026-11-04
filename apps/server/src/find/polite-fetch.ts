import type { Logger } from '../log.ts';

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface FetchedBody {
  status: number;
  contentType: string;
  bytes: Uint8Array;
}

export interface PoliteFetchOptions {
  fetch?: typeof fetch;
  userAgent: string;
  minGapMs: number;
  timeoutMs: number;
  allowed: (url: URL) => boolean;
  log: Logger;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface GetOptions {
  accept: string;
  maxBytes: number;
}

const MAX_REDIRECTS = 3;

export class PoliteFetch {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly turn = new Map<string, Promise<unknown>>();
  private readonly lastStart = new Map<string, number>();

  constructor(private readonly opts: PoliteFetchOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async get(href: string, options: GetOptions): Promise<FetchedBody> {
    let url = this.checked(href);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await this.once(url, options);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!location) throw new UpstreamError(`${url.host} sent a redirect with nowhere to go`);
        url = this.checked(new URL(location, url).href);
        this.opts.log.info(
          { to: url.href, hop },
          'dewidebug find upstream redirect, target is on the allowed list',
        );
        continue;
      }
      return this.read(url, res, options);
    }
    throw new UpstreamError(`${url.host} redirected too many times`);
  }

  private checked(href: string): URL {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      throw new UpstreamError(`Not a web address: ${href}`);
    }
    if (!this.opts.allowed(url)) {
      this.opts.log.warn(
        { url: url.href },
        'dewidebug find refused: address is not on the allowed list',
      );
      throw new UpstreamError(`${url.origin} is not one of the sites this app searches`);
    }
    return url;
  }

  private async once(url: URL, options: GetOptions): Promise<Response> {
    await this.waitForTurn(url.origin);
    const started = this.now();
    this.opts.log.info({ url: url.href }, 'dewidebug find upstream request');
    try {
      const res = await this.fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.opts.timeoutMs),
        headers: { 'user-agent': this.opts.userAgent, accept: options.accept },
      });
      this.opts.log.info(
        {
          url: url.href,
          status: res.status,
          contentType: res.headers.get('content-type'),
          contentLength: res.headers.get('content-length'),
          ms: this.now() - started,
        },
        'dewidebug find upstream response',
      );
      return res;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.opts.log.warn(
        { url: url.href, error: reason },
        'dewidebug find upstream request failed',
      );
      throw new UpstreamError(`Could not reach ${url.host}: ${reason}`);
    }
  }

  private async read(url: URL, res: Response, options: GetOptions): Promise<FetchedBody> {
    if (res.status < 200 || res.status >= 300) {
      await res.body?.cancel().catch(() => undefined);
      throw new UpstreamError(`${url.host} answered ${String(res.status)}`);
    }
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > options.maxBytes) {
      await res.body?.cancel().catch(() => undefined);
      throw new UpstreamError(
        `${url.host} offered a file over the ${String(options.maxBytes)} byte limit`,
      );
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength;
        if (total > options.maxBytes) {
          throw new UpstreamError(
            `${url.host} sent more than the ${String(options.maxBytes)} byte limit`,
          );
        }
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      this.opts.log.warn(
        { url: url.href, error: reason, read: total },
        'dewidebug find upstream body failed',
      );
      throw new UpstreamError(`${url.host} stopped sending: ${reason}`);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', bytes };
  }

  private waitForTurn(origin: string): Promise<void> {
    const previous = this.turn.get(origin) ?? Promise.resolve();
    const next = previous.then(async () => {
      const last = this.lastStart.get(origin);
      const wait = last === undefined ? 0 : last + this.opts.minGapMs - this.now();
      if (wait > 0) {
        this.opts.log.info(
          { origin, waitMs: wait },
          'dewidebug find waiting so the site is not hit in a burst',
        );
        await this.sleep(wait);
      }
      this.lastStart.set(origin, this.now());
    });
    this.turn.set(
      origin,
      next.catch(() => undefined),
    );
    return next;
  }
}
