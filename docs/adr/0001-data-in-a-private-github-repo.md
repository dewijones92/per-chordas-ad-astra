---
title: Store practice data as files in a private GitHub repo, via a clone on the Pi
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0001 · Data lives in a private GitHub repo, written through a clone on the Pi

## Context

Dewi asked for an app that "stores everything in a GitHub repo". The data is PDFs, audio, drawings
and a practice log: personal, so it must not be public, and it must outlive the app and the Pi (the Pi
is undervolted and its root disk is USB; it has already had one silent half-outage).

## Decision

- A **separate private repo**, `dewijones92/per-chordas-ad-astra-data`, holds the data. The code repo
  stays public and data-free.
- The server keeps a **git working copy** on the Pi (`/var/lib/per-chordas-ad-astra/data`) and pushes
  with a **per-repo deploy key** (write access to that repo only).
- Files are plain and readable: `pieces/<slug>/piece.json`, `scores/*.pdf`, `annotations/*.json`,
  `tracks/*`, `loops.json`, `setlists.json`, `log/YYYY/MM.jsonl`, `schema-version`. JSON keeps number
  arrays on one line so a stroke diff is one line per point.

## Alternatives

- _GitHub Contents/Git Data API with a fine-grained PAT_: every read is a network round trip, a
  multi-file change needs the tree API, and a PAT is broader and expires.
- _Pi disk with a periodic push_: no history per edit, and a sync job to keep alive.

## Consequences

- Reads are local-disk fast, and the app keeps working while GitHub is down (commits queue, then push).
- The clone must be recovered after crashes; `SyncEngine.init` commits stray files and rebases.
- GitHub rejects files ≥100 MB, so uploads are capped at 50 MB.
