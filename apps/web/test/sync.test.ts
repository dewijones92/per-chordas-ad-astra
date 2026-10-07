import type { SyncStatus } from '@pcaa/shared';
import { describe, expect, it, vi } from 'vitest';
import { describeSync } from '../src/sync/describe.ts';
import { saves } from '../src/sync/saves.ts';

const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  phase: 'clean',
  pendingChanges: 0,
  unpushedCommits: 0,
  lastCommitAt: null,
  lastPushAt: '2026-10-07T10:00:00.000Z',
  lastError: null,
  nextRetryAt: null,
  ...over,
});
const idle = { inFlight: 0, lastError: null, lastSettledAt: 0 };

describe('describeSync', () => {
  it('reports the strongest problem first', () => {
    expect(describeSync({ ...idle, lastError: 'boom' }, status(), true).tone).toBe('error');
    expect(describeSync(idle, status(), false).tone).toBe('offline');
    expect(describeSync({ ...idle, inFlight: 1 }, status(), true).text).toBe('Saving…');
    expect(describeSync(idle, null, true).text).toBe('Checking…');
  });

  it('maps every server phase to a pill', () => {
    expect(describeSync(idle, status(), true)).toMatchObject({ tone: 'github', text: 'In GitHub' });
    expect(describeSync(idle, status({ lastPushAt: null }), true).detail).toBe(
      'Everything is in GitHub.',
    );
    for (const phase of ['dirty', 'committing', 'pushing'] as const) {
      expect(describeSync(idle, status({ phase, pendingChanges: 2 }), true)).toMatchObject({
        tone: 'pi',
        text: 'Saved on Pi',
      });
    }
    expect(
      describeSync(
        idle,
        status({
          phase: 'commit-failed',
          pendingChanges: 1,
          lastError: 'Commit failed: index.lock',
        }),
        true,
      ),
    ).toMatchObject({ tone: 'error', text: 'Not committed' });
    const failed = describeSync(
      idle,
      status({
        phase: 'push-failed',
        unpushedCommits: 3,
        lastError: 'no route',
        nextRetryAt: '2026-10-07T10:05:00.000Z',
      }),
      true,
    );
    expect(failed).toMatchObject({ tone: 'error', text: 'GitHub unreachable' });
    expect(failed.detail).toContain('3 commit(s) waiting');
    expect(failed.detail).toContain('no route');
  });
});

describe('saves tracker', () => {
  it('counts in-flight saves and records the last failure', async () => {
    const seen: number[] = [];
    const unsubscribe = saves.subscribe(() => seen.push(saves.getSnapshot().inFlight));
    await saves.track('ok', Promise.resolve(1));
    expect(saves.getSnapshot()).toMatchObject({ inFlight: 0, lastError: null });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await expect(saves.track('drawing', Promise.reject(new Error('offline')))).rejects.toThrow(
      'offline',
    );
    expect(saves.getSnapshot().lastError).toBe('Could not save drawing: offline');
    await saves.track('again', Promise.resolve(2));
    expect(saves.getSnapshot().lastError).toBeNull();
    expect(seen).toEqual([1, 0, 1, 0, 1, 0]);
    unsubscribe();
  });
});
