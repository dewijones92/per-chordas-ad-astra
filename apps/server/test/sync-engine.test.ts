import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitMessage } from '../src/store/sync-engine.ts';
import { engineFor, gitIn, makeBareRemote, tempDir, waitFor } from './helpers.ts';

describe('commitMessage', () => {
  it('uses a lone description as the subject', () => {
    expect(commitMessage(["Add piece 'Blackbird'"])).toBe("Add piece 'Blackbird'");
  });

  it('folds repeats and lists every change in the body', () => {
    const message = commitMessage(['Annotate A', 'Annotate A', 'Edit B', 'Update setlists']);
    expect(message.split('\n')[0]).toBe('3 changes: Annotate A (×2); Edit B; …');
    expect(message).toContain('- Update setlists');
  });

  it('has a fallback subject when nothing was described', () => {
    expect(commitMessage([])).toBe('Save changes');
  });
});

describe('SyncEngine against a bare remote', () => {
  let root: string;
  let cleanup: () => Promise<void>;
  let remote: string;
  let dir: string;

  beforeEach(async () => {
    ({ path: root, cleanup } = await tempDir());
    remote = makeBareRemote(root);
    dir = join(root, 'clone');
  });
  afterEach(async () => cleanup());

  it('initialises an empty remote with a first commit and pushes it', async () => {
    const engine = engineFor(dir, remote);
    await engine.init();
    await waitFor(() => engine.status().phase === 'clean');
    expect(gitIn(remote, 'log', '--format=%s', 'main').trim().split('\n')).toEqual([
      'Ignore the server-side state folder',
      'Initialise practice library',
    ]);
    expect(gitIn(remote, 'show', 'main:.gitignore')).toBe('.state/\n');
    expect(engine.status().unpushedCommits).toBe(0);
    await engine.close();
  });

  it('batches several changes into one commit after the idle period, then pushes', async () => {
    const engine = engineFor(dir, remote, { idleMs: 80 });
    await engine.init();
    await waitFor(() => engine.status().phase === 'clean');

    await writeFile(join(dir, 'a.txt'), 'a');
    engine.markDirty('Edit A');
    await writeFile(join(dir, 'b.txt'), 'b');
    engine.markDirty('Edit B');
    expect(engine.status().phase).toBe('dirty');
    expect(engine.status().pendingChanges).toBe(2);

    await waitFor(() => engine.status().phase === 'clean' && engine.status().lastPushAt !== null);
    const subjects = gitIn(remote, 'log', '--format=%s', 'main').trim().split('\n');
    expect(subjects[0]).toBe('2 changes: Edit A; Edit B');
    await engine.close();
  });

  it('flush commits immediately without waiting for the idle timer', async () => {
    const engine = engineFor(dir, remote, { idleMs: 60_000 });
    await engine.init();
    await writeFile(join(dir, 'c.txt'), 'c');
    engine.markDirty('Edit C');
    const status = await engine.flush('test');
    expect(status.phase).toBe('clean');
    expect(gitIn(remote, 'log', '-1', '--format=%s', 'main').trim()).toBe('Edit C');
    await engine.close();
  });

  it('keeps commits locally when GitHub is unreachable and retries until it comes back', async () => {
    const engine = engineFor(dir, remote, { idleMs: 60_000, retryDelaysMs: [100] });
    await engine.init();
    await waitFor(() => engine.status().phase === 'clean');

    const parked = `${remote}.parked`;
    await rename(remote, parked);
    await writeFile(join(dir, 'd.txt'), 'd');
    engine.markDirty('Edit D');
    const failed = await engine.flush('test');
    expect(failed.phase).toBe('push-failed');
    expect(failed.unpushedCommits).toBe(1);
    expect(failed.lastError).toMatch(/Push failed/);
    expect(failed.nextRetryAt).not.toBeNull();

    await rename(parked, remote);
    await waitFor(() => engine.status().phase === 'clean', 5_000);
    expect(engine.status().lastError).toBeNull();
    expect(gitIn(remote, 'log', '-1', '--format=%s', 'main').trim()).toBe('Edit D');
    await engine.close();
  });

  it('rebases onto a commit pushed from elsewhere instead of losing either', async () => {
    const engine = engineFor(dir, remote, { idleMs: 60_000 });
    await engine.init();
    await waitFor(() => engine.status().phase === 'clean');

    const other = join(root, 'other');
    gitIn(root, 'clone', '-q', remote, other);
    await writeFile(join(other, 'elsewhere.txt'), 'x');
    gitIn(other, 'add', '-A');
    gitIn(other, 'commit', '-q', '-m', 'Edited on GitHub');
    gitIn(other, 'push', '-q', 'origin', 'main');

    await writeFile(join(dir, 'here.txt'), 'y');
    engine.markDirty('Edited in the app');
    const status = await engine.flush('test');
    expect(status.phase).toBe('clean');
    const subjects = gitIn(remote, 'log', '--format=%s', 'main').trim().split('\n');
    expect(subjects.slice(0, 2)).toEqual(['Edited in the app', 'Edited on GitHub']);
    await engine.close();
  });

  it('commits files left uncommitted by a crash when it restarts', async () => {
    const first = engineFor(dir, remote, { idleMs: 60_000 });
    await first.init();
    await waitFor(() => first.status().phase === 'clean');
    await writeFile(join(dir, 'unsaved.txt'), 'z');

    const second = engineFor(dir, remote);
    await second.init();
    await waitFor(() => second.status().phase === 'clean');
    expect(gitIn(remote, 'log', '-1', '--format=%s', 'main').trim()).toBe(
      'Recover changes saved before a restart',
    );
    await second.close();
  });

  it('skips the commit when the working tree has not actually changed', async () => {
    const engine = engineFor(dir, remote, { idleMs: 60_000 });
    await engine.init();
    await waitFor(() => engine.status().phase === 'clean');
    const before = gitIn(remote, 'rev-parse', 'main');
    engine.markDirty('Nothing really');
    await engine.flush('test');
    expect(gitIn(remote, 'rev-parse', 'main')).toBe(before);
    await engine.close();
  });

  it('works without a remote in local dev mode', async () => {
    const engine = engineFor(dir, '');
    await engine.init();
    await writeFile(join(dir, 'e.txt'), 'e');
    engine.markDirty('Edit E');
    const status = await engine.flush('test');
    expect(status).toMatchObject({ phase: 'clean', unpushedCommits: 0 });
    expect(gitIn(dir, 'log', '-1', '--format=%s').trim()).toBe('Edit E');
    await engine.close();
  });

  it('never commits the server-side state folder, and adds the ignore rule only once', async () => {
    const engine = engineFor(dir, remote, { idleMs: 60_000 });
    await engine.init();
    await mkdir(join(dir, '.state'), { recursive: true });
    await writeFile(join(dir, '.state', 'resume.json'), '{}');
    await writeFile(join(dir, 'real.txt'), 'r');
    engine.markDirty('Edit real');
    await engine.flush('test');
    expect(gitIn(remote, 'ls-tree', '-r', '--name-only', 'main')).not.toContain('.state');
    await engine.close();
    const again = engineFor(dir, remote);
    await again.init();
    expect(
      gitIn(dir, 'log', '--format=%s')
        .split('\n')
        .filter((l) => l.startsWith('Ignore')),
    ).toHaveLength(1);
    await again.close();
  });
});
