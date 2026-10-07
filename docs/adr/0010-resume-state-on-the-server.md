---
title: Keep "where you left off" on the Pi, git-ignored, merged newest-wins across devices
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0010 · Resume state lives on the server, outside git

## Context

Dewi said yes to cross-device resume ([0009](0009-resume-state-per-browser.md) kept it per browser).
Writing positions into the data repo would mean a commit for every scroll.

## Decision

- Every device already talks to the one server on the Pi, so the server keeps the state in
  `DATA_DIR/.state/resume.json`. `SyncEngine.init` makes sure the data repo's `.gitignore` lists `.state/`,
  so it is **never committed**.
- `GET`/`PUT /api/resume`. Every entry (last path, score spot per score, chosen score per piece, looper
  per piece, timer per piece) carries an `at` timestamp, and `mergeResume` in `packages/shared` keeps the
  newest entry per key. The same function is used by the server and the browser.
- The browser keeps a local copy for speed, pushes it 1 s after the last change (and with keepalive
  when the page hides), and on start pulls the server copy (waiting at most 1.5 s) before deciding where
  to open.
- A cleared timer is a stamped tombstone, so clearing on one device clears it everywhere. Nothing is
  written until something actually changes, so merely opening a piece never overwrites a newer spot from
  another device.

## Consequences

- No git noise; resume works on any device that reaches the Pi.
- If the Pi's disk is lost, only "where you were" is lost; the practice data is in GitHub.
- Two devices editing positions at the same moment: the newest stamp wins, per entry.
