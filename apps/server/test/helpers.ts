import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino } from 'pino';
import { createGit } from '../src/store/git.ts';
import type { RepoGate } from '../src/store/repo-gate.ts';
import { SyncEngine } from '../src/store/sync-engine.ts';

export const silentLog = pino({ level: 'silent' });

export async function tempDir(
  prefix = 'pcaa-',
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) };
}

export function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'color.ui=never', ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });
}

export function makeBareRemote(root: string, name = 'remote.git'): string {
  const path = join(root, name);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', path]);
  return path;
}

export function engineFor(
  dir: string,
  remote: string,
  overrides: Partial<{ idleMs: number; retryDelaysMs: number[] }> = {},
  gate?: RepoGate,
): SyncEngine {
  return new SyncEngine({
    git: createGit({ cwd: dir, authorName: 'tester', authorEmail: 'tester@example.com' }),
    dir,
    remote,
    branch: 'main',
    idleMs: overrides.idleMs ?? 30,
    retryDelaysMs: overrides.retryDelaysMs ?? [50],
    log: silentLog,
    ...(gate ? { gate } : {}),
  });
}

export async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`waitFor timed out after ${String(timeoutMs)} ms`);
}
