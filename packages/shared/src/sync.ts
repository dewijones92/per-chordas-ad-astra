import { z } from 'zod';

export const SyncPhase = z.enum([
  'clean',
  'dirty',
  'committing',
  'pushing',
  'push-failed',
  'commit-failed',
]);
export type SyncPhase = z.infer<typeof SyncPhase>;

export const SyncStatus = z.object({
  phase: SyncPhase,
  pendingChanges: z.int().min(0),
  unpushedCommits: z.int().min(0),
  lastCommitAt: z.iso.datetime().nullable(),
  lastPushAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  nextRetryAt: z.iso.datetime().nullable(),
});
export type SyncStatus = z.infer<typeof SyncStatus>;

export const Health = z.object({
  ok: z.boolean(),
  version: z.string(),
  sync: SyncStatus,
});
export type Health = z.infer<typeof Health>;
