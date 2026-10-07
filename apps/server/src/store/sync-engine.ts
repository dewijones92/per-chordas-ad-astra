import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SCHEMA_VERSION, type SyncPhase, type SyncStatus } from '@pcaa/shared';
import type { Logger } from '../log.ts';
import { GitError, type Git } from './git.ts';
import { RepoGate } from './repo-gate.ts';

export interface SyncEngineOptions {
  git: Git;
  dir: string;
  remote: string;
  branch: string;
  idleMs: number;
  retryDelaysMs: readonly number[];
  log: Logger;
  now?: () => Date;
  gate?: RepoGate;
}

type Activity = 'idle' | 'committing' | 'pushing';

const IGNORED = '.state/';

export function commitMessage(descriptions: readonly string[]): string {
  if (descriptions.length === 0) return 'Save changes';
  const counts = new Map<string, number>();
  for (const d of descriptions) counts.set(d, (counts.get(d) ?? 0) + 1);
  const lines = [...counts].map(([d, n]) => (n > 1 ? `${d} (×${String(n)})` : d));
  const [only] = lines;
  if (lines.length === 1 && only !== undefined) return only;
  const head = lines.slice(0, 2).join('; ');
  const subject = `${String(lines.length)} changes: ${head}${lines.length > 2 ? '; …' : ''}`;
  return `${subject}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`;
}

function isNonFastForward(error: unknown): boolean {
  return error instanceof GitError && /non-fast-forward|fetch first|rejected/i.test(error.stderr);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export class SyncEngine {
  private readonly git: Git;
  private readonly opts: SyncEngineOptions;
  private readonly log: Logger;
  private readonly now: () => Date;
  private pending: string[] = [];
  private activity: Activity = 'idle';
  private unpushed = 0;
  private lastCommitAt: string | null = null;
  private lastPushAt: string | null = null;
  private lastError: string | null = null;
  private nextRetryAt: string | null = null;
  private retryAttempt = 0;
  private idleTimer: NodeJS.Timeout | undefined;
  private retryTimer: NodeJS.Timeout | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private closed = false;
  private commitError: string | null = null;
  private readonly gate: RepoGate;

  constructor(opts: SyncEngineOptions) {
    this.opts = opts;
    this.git = opts.git;
    this.log = opts.log.child({ component: 'sync' });
    this.now = opts.now ?? (() => new Date());
    this.gate = opts.gate ?? new RepoGate();
  }

  get hasRemote(): boolean {
    return this.opts.remote !== '';
  }

  async init(): Promise<void> {
    const { dir, remote, branch } = this.opts;
    await mkdir(dir, { recursive: true });
    if (await exists(join(dir, '.git'))) {
      this.log.info({ dir }, 'dewidebug sync init: existing clone found');
      if (this.hasRemote) await this.tryFetch();
    } else if (this.hasRemote) {
      this.log.info({ dir, remote }, 'dewidebug sync init: cloning data repo');
      await this.git(['clone', '-q', remote, '.']);
    } else {
      this.log.warn({ dir }, 'dewidebug sync init: no DATA_REMOTE, local-only repo (dev mode)');
      await this.git(['init', '-q', '-b', branch]);
    }

    if (!(await this.hasCommits())) {
      this.log.info({ branch }, 'dewidebug sync init: empty repo, writing initial commit');
      await this.git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
      await writeFile(join(dir, 'schema-version'), `${String(SCHEMA_VERSION)}\n`);
      await writeFile(join(dir, 'setlists.json'), `${JSON.stringify({ setlists: [] }, null, 2)}\n`);
      await this.git(['add', '-A']);
      await this.git(['commit', '-q', '-m', 'Initialise practice library']);
    }

    await this.ensureIgnored();

    if ((await this.git(['status', '--porcelain'])).stdout.trim() !== '') {
      this.log.warn(
        'dewidebug sync init: uncommitted files from before a restart, committing them',
      );
      await this.git(['add', '-A']);
      await this.git(['commit', '-q', '-m', 'Recover changes saved before a restart']);
    }

    if (this.hasRemote && (await this.remoteBranchExists())) {
      try {
        await this.gate.exclusive(() => this.git(['rebase', '-q', `origin/${branch}`]));
      } catch (error) {
        await this.git(['rebase', '--abort']).catch(() => undefined);
        this.lastError = `Local and GitHub copies have diverged: ${String(error)}`;
        this.log.error({ err: error }, 'dewidebug sync init: rebase onto remote failed, aborted');
      }
    }

    this.unpushed = await this.countUnpushed();
    this.log.info(
      { unpushed: this.unpushed, hasRemote: this.hasRemote },
      'dewidebug sync init: ready',
    );
    if (this.unpushed > 0) void this.enqueue(() => this.push('startup'));
  }

  markDirty(description: string): void {
    if (this.closed) {
      this.log.warn({ description }, 'dewidebug sync markDirty after close; will not be committed');
      return;
    }
    this.pending.push(description);
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.flush('idle');
    }, this.opts.idleMs);
    this.log.debug(
      { description, pending: this.pending.length, idleMs: this.opts.idleMs },
      'dewidebug sync change recorded, commit timer (re)armed',
    );
  }

  status(): SyncStatus {
    return {
      phase: this.phase(),
      pendingChanges: this.pending.length,
      unpushedCommits: this.unpushed,
      lastCommitAt: this.lastCommitAt,
      lastPushAt: this.lastPushAt,
      lastError: this.lastError,
      nextRetryAt: this.nextRetryAt,
    };
  }

  flush(reason: string): Promise<SyncStatus> {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    return this.enqueue(async () => {
      const committed = await this.commit(reason);
      if (committed || this.unpushed > 0) await this.push(reason);
      return this.status();
    });
  }

  async close(): Promise<void> {
    this.log.info({ pending: this.pending.length }, 'dewidebug sync close: final flush');
    const final = this.flush('shutdown');
    this.closed = true;
    await final;
    clearTimeout(this.retryTimer);
    clearTimeout(this.idleTimer);
  }

  private phase(): SyncPhase {
    if (this.activity !== 'idle') return this.activity;
    if (this.pending.length > 0) return this.commitError ? 'commit-failed' : 'dirty';
    if (this.unpushed > 0) return this.lastError ? 'push-failed' : 'dirty';
    return 'clean';
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async commit(reason: string): Promise<boolean> {
    const descriptions = this.pending.splice(0);
    this.activity = 'committing';
    try {
      await this.git(['add', '-A']);
      const changed = (await this.git(['status', '--porcelain'])).stdout.trim();
      if (changed === '') {
        this.log.info(
          { reason, descriptions: descriptions.length },
          'dewidebug sync commit skipped: working tree already matches HEAD',
        );
        return false;
      }
      const message = commitMessage(descriptions);
      await this.git(['commit', '-q', '-m', message]);
      if (this.commitError) {
        this.log.info({ previous: this.commitError }, 'dewidebug sync commit recovered');
        if (this.lastError === this.commitError) this.lastError = null;
        this.commitError = null;
      }
      this.lastCommitAt = this.now().toISOString();
      this.unpushed += 1;
      this.log.info(
        { reason, files: changed.split('\n').length, subject: message.split('\n')[0] },
        'dewidebug sync committed',
      );
      return true;
    } catch (error) {
      this.pending.unshift(...descriptions);
      this.commitError = `Commit failed: ${error instanceof Error ? error.message : String(error)}`;
      this.lastError = this.commitError;
      this.scheduleRetry();
      this.log.error(
        { err: error, reason, nextRetryAt: this.nextRetryAt },
        'dewidebug sync commit failed, changes kept pending; retry scheduled',
      );
      return false;
    } finally {
      this.activity = 'idle';
    }
  }

  private async push(reason: string): Promise<void> {
    if (!this.hasRemote) {
      this.unpushed = 0;
      return;
    }
    clearTimeout(this.retryTimer);
    this.nextRetryAt = null;
    this.activity = 'pushing';
    const { branch } = this.opts;
    try {
      try {
        await this.git(['push', '-q', 'origin', `HEAD:${branch}`]);
      } catch (error) {
        if (!isNonFastForward(error)) throw error;
        this.log.warn('dewidebug sync push rejected as non-fast-forward, rebasing onto GitHub');
        await this.git(['fetch', '-q', 'origin', branch]);
        await this.gate.exclusive(async () => {
          this.log.info('dewidebug sync rebase holding the repo gate; saves wait');
          try {
            await this.git(['rebase', '-q', '--autostash', `origin/${branch}`]);
          } catch (rebaseError) {
            await this.git(['rebase', '--abort']).catch(() => undefined);
            throw rebaseError;
          }
        });
        await this.git(['push', '-q', 'origin', `HEAD:${branch}`]);
      }
      this.unpushed = await this.countUnpushed();
      this.lastPushAt = this.now().toISOString();
      this.lastError = null;
      this.retryAttempt = 0;
      this.log.info({ reason, unpushed: this.unpushed }, 'dewidebug sync pushed to GitHub');
    } catch (error) {
      this.lastError = `Push failed: ${error instanceof Error ? error.message : String(error)}`;
      this.scheduleRetry();
      this.log.error(
        { err: error, reason, attempt: this.retryAttempt, nextRetryAt: this.nextRetryAt },
        'dewidebug sync push failed; commits are safe locally, retry scheduled',
      );
    } finally {
      this.activity = 'idle';
    }
  }

  private scheduleRetry(): void {
    if (this.closed) return;
    const delays = this.opts.retryDelaysMs;
    const delay = delays[Math.min(this.retryAttempt, delays.length - 1)] ?? 300_000;
    this.retryAttempt += 1;
    this.nextRetryAt = new Date(this.now().getTime() + delay).toISOString();
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      void this.flush(`retry ${String(this.retryAttempt)}`);
    }, delay);
  }

  private async tryFetch(): Promise<void> {
    try {
      await this.git(['fetch', '-q', 'origin']);
    } catch (error) {
      this.lastError = `Could not reach GitHub at startup: ${String(error)}`;
      this.log.warn(
        { err: error },
        'dewidebug sync init: fetch failed, continuing from local copy',
      );
    }
  }

  private async ensureIgnored(): Promise<void> {
    const path = join(this.opts.dir, '.gitignore');
    const current = await readFile(path, 'utf8').catch(() => '');
    if (current.split('\n').some((line) => line.trim() === IGNORED)) return;
    await writeFile(
      path,
      `${current}${current === '' || current.endsWith('\n') ? '' : '\n'}${IGNORED}\n`,
    );
    await this.git(['add', '.gitignore']);
    await this.git(['commit', '-q', '-m', 'Ignore the server-side state folder']);
    this.unpushed += 1;
    this.log.info(
      { ignored: IGNORED },
      'dewidebug sync init: added the state folder to .gitignore',
    );
  }

  private async hasCommits(): Promise<boolean> {
    try {
      await this.git(['rev-parse', '--verify', '-q', 'HEAD']);
      return true;
    } catch {
      return false;
    }
  }

  private async remoteBranchExists(): Promise<boolean> {
    try {
      await this.git(['rev-parse', '--verify', '-q', `refs/remotes/origin/${this.opts.branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  private async countUnpushed(): Promise<number> {
    if (!this.hasRemote) return 0;
    const range = (await this.remoteBranchExists()) ? `origin/${this.opts.branch}..HEAD` : 'HEAD';
    const { stdout } = await this.git(['rev-list', '--count', range]);
    return Number.parseInt(stdout.trim(), 10) || 0;
  }
}
