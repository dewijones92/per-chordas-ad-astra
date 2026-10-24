import type { SyncStatus } from '@pcaa/shared';
import { strings, tips } from '../strings.ts';
import type { SavesSnapshot } from './saves.ts';

export type Tone = 'busy' | 'pi' | 'github' | 'error' | 'offline';

export interface SyncLabel {
  tone: Tone;
  text: string;
  detail: string;
}

function clock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

export function describeSync(
  local: SavesSnapshot,
  server: SyncStatus | null,
  reachable: boolean,
): SyncLabel {
  if (local.lastError)
    return { tone: 'error', text: strings.sync.notSaved, detail: local.lastError };
  if (!reachable) {
    return {
      tone: 'offline',
      text: strings.sync.offline,
      detail: tips.sync.offline,
    };
  }
  if (local.inFlight > 0)
    return { tone: 'busy', text: strings.sync.saving, detail: tips.sync.saving };
  if (server === null) return { tone: 'busy', text: strings.sync.checking, detail: '' };
  switch (server.phase) {
    case 'clean':
      return {
        tone: 'github',
        text: strings.sync.github,
        detail: tips.sync.github(clock(server.lastPushAt)),
      };
    case 'commit-failed':
      return {
        tone: 'error',
        text: strings.sync.notCommitted,
        detail: tips.sync.notCommitted(clock(server.nextRetryAt), server.lastError ?? ''),
      };
    case 'push-failed':
      return {
        tone: 'error',
        text: strings.sync.githubUnreachable,
        detail: tips.sync.githubUnreachable(
          server.unpushedCommits,
          clock(server.nextRetryAt),
          server.lastError ?? '',
        ),
      };
    case 'dirty':
    case 'committing':
    case 'pushing':
      return {
        tone: 'pi',
        text: strings.sync.savedOnPi,
        detail: tips.sync.savedOnPi(server.pendingChanges),
      };
  }
}
