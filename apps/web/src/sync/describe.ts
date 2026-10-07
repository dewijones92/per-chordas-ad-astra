import type { SyncStatus } from '@pcaa/shared';
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
  if (local.lastError) return { tone: 'error', text: 'Not saved', detail: local.lastError };
  if (!reachable) {
    return {
      tone: 'offline',
      text: 'Server unreachable',
      detail: 'Changes cannot be saved until it is back.',
    };
  }
  if (local.inFlight > 0)
    return { tone: 'busy', text: 'Saving…', detail: 'Sending your change to the Pi.' };
  if (server === null) return { tone: 'busy', text: 'Checking…', detail: '' };
  switch (server.phase) {
    case 'clean':
      return {
        tone: 'github',
        text: 'In GitHub',
        detail: server.lastPushAt
          ? `Everything is in GitHub (last push ${clock(server.lastPushAt)}).`
          : 'Everything is in GitHub.',
      };
    case 'push-failed':
      return {
        tone: 'error',
        text: 'GitHub unreachable',
        detail: `Saved on the Pi; ${String(server.unpushedCommits)} commit(s) waiting. Retrying ${clock(server.nextRetryAt)}. ${server.lastError ?? ''}`,
      };
    case 'dirty':
    case 'committing':
    case 'pushing':
      return {
        tone: 'pi',
        text: 'Saved on Pi',
        detail: `Committing to GitHub shortly (${String(server.pendingChanges)} change(s) pending).`,
      };
  }
}
