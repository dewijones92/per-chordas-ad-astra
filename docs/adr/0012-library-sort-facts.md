---
title: Where each library sort gets its facts
status: accepted
date: 2026-10-14
updated: 2026-10-14
---

# 0012 · Library sorts read recorded facts, not reconstructed ones

## Context

Dewi asked for the library to sort by date created, edited and opened, and "other good ideas". Each sort
needs a fact per piece, and several were not recorded anywhere: `updatedAt` only moved on metadata and
file changes, so drawing on a score did not count as an edit, and nothing stored when a piece was opened.

## Decision

- **Added** reads `createdAt`.
- **Edited** reads `updatedAt`, which now also moves when drawings or loops are saved, and when PDF marks
  are imported (only if any were converted). A save that changes nothing does not move it. It is written
  into `piece.json`, so it travels with the data repo, rather than being guessed from file times
  (which a fresh clone resets) or the git log.
- **Pinning is not an edit.** A patch that only changes `pinned` keeps `updatedAt`, and its commit
  message says `Pin` or `Unpin`. `pinned` lives in `piece.json` so it is the same on every device.
- **Opened** reads a new `opened` entry in the resume state (ADR 0010), stamped when a piece page has
  loaded. Older resume entries for the piece (score spot, chosen score, looper, timer) also count, so
  pieces opened before this change still sort sensibly. Like the rest of resume state it is kept on the
  Pi, outside git: opening a piece is not a change to the practice data.
- **Practised**, **Needs practice** and **Most practised** read the practice log.
- The chosen sort is a per-browser convenience in `localStorage`. A setlist always opens in its own
  order. While searching, results stay in best-match order.

## Consequences

- Drawing sessions now rewrite `piece.json` as well as the annotation file, in the same batched commit.
- "Edited" for pieces drawn on before this change is their last metadata edit; it corrects itself on
  the next drawing save.
- If the Pi's disk is lost, "opened" history is lost with the rest of the resume state.
