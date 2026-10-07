---
title: GitHub sync and the status pill
status: shipped
updated: 2026-10-07
---

# Sync

See [ADR 0001](../adr/0001-data-in-a-private-github-repo.md) and [ADR 0002](../adr/0002-batched-autosave-commits.md).

The pill in the header:

| Pill                           | Meaning                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| Saving…                        | a request is in flight from this browser                       |
| Saved on Pi                    | on disk, commit or push pending; click to push now             |
| In GitHub                      | everything is pushed                                           |
| GitHub unreachable             | committed on the Pi, retry time in the tooltip                 |
| Not saved / Server unreachable | the browser could not reach the server; the change is not safe |

`/healthz` (open, no data) returns the version and the same sync status, for the deploy check.
Server logs (`dewidebug sync …`) record every commit, push, retry and recovery.

Files: `apps/server/src/store/sync-engine.ts`, `apps/web/src/sync/*`.
Tests: `apps/server/test/sync-engine.test.ts` (real bare remote: batching, outage then retry, rebase over
remote edits, crash recovery, local mode), every e2e that reads the remote.

The data repo's `.gitignore` lists `.state/` (added by the server on start): server-side state such as
"where you left off" lives there and is never committed.
