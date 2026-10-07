---
title: Autosave immediately, commit in batches, push with backoff
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0002 · Batched autosave commits

## Context

Dewi chose "autosave, batched" over a Save button or a commit per stroke. One commit per stroke would
make an unreadable history; a Save button loses work.

## Decision

- The browser sends each change to the server straight away (annotations debounced 800 ms).
- The server writes the file atomically and records a human description ("Annotate 'Romanza'
  (romanza.pdf p.2)").
- After **20 s with no further change** (`COMMIT_IDLE_MS`), or on an explicit flush (leaving a piece,
  the page being hidden, `docker stop`), it makes **one commit** whose message lists the changes, then
  pushes.
- A failed push keeps the commits locally and retries at 5 s, 30 s, 2 min, then every 5 min. A
  non-fast-forward push fetches, rebases and retries once.
- The UI pill shows the real state: _Saving…_ → _Saved on Pi_ → _In GitHub_, or _GitHub unreachable_
  with the next retry time.

## Consequences

- Up to ~20 s of edits exist only on the Pi's disk; a power cut loses nothing already written, and
  startup commits any stray files.
- `SIGTERM` handling matters: tini forwards it, and the server flushes before exiting (verified: the
  commit lands about 60 ms after `docker stop`).
