---
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0030 · Drawing saves send what changed, not the whole drawing

## Context

The batch review of 4 Nov 2026 found that every drawing layer (the PDF, the stave and the falling notes) saved by
sending the whole `Annotations` document for its file with `PUT`. Two tabs or two people drawing on one score meant
the last save won and silently threw away the other's marks: a tab opened before Dewi's wife stamped a fingering would
erase that stamp with its next stroke. Fingering already avoids this by saving one note at a time (ADR 0021), and the
CLAUDE.md gotcha "never send a whole document to change one part of it" names the pattern.

## Decision

- **A save is a change set**, `AnnotationChanges` in `packages/shared`: `{ version: 1, put: items by page, remove: ids }`,
  strict, so a whole document sent to the endpoint is refused with 400.
- **The browser sends the difference from the last confirmed save** (`diffAnnotations`): a new or edited item, or one
  moved to another page, goes in `put`; an item that is gone goes in `remove`. Nothing is sent for an unchanged
  drawing.
- **The server applies it to what it holds** (`applyAnnotationChanges`): an edited item is replaced where it stood,
  so drawing order is kept; a new one is appended; a moved one leaves its old page; removing an id it no longer has
  is not an error. The PDF import marker is kept. The result is per-item last-writer-wins, the same rule as fingering.
- **`PATCH` replaces `PUT`** on `/api/pieces/:id/annotations/:file` and `…/falling`, for all three layers, through
  `DataRepo.changeAnnotations` and `changeFallingDrawings`. There is one way to save a drawing; a stale tab that still
  sends `PUT` gets an error strip and a reload fixes it.
- **One save in flight at a time.** A change made while a save is on its way waits for it, then sends its own
  difference from what was confirmed. Without this, a stamp added and removed between two overlapping saves was never
  named in the second one, and the server kept it. The keepalive save on leaving the page cannot wait, so it sends the
  difference from the save in flight.

## Consequences

- Marks made in another tab or by the other person survive; they show in this tab on its next load (there is no live
  push).
- An item edited in one tab and erased in the other ends as whichever save reaches the server last.
- Undo in one tab removes only its own marks, because a removal names ids.
- The commit message still names the pages or bars that changed, worked out from the stored file before and after.
