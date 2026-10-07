---
title: Score viewer and annotation
status: shipped
updated: 2026-10-07
---

# Score viewer and annotation

**Viewing.** pdf.js renders a page to a canvas when it comes within 1½ screens of the score panel, at device pixel
ratio, and frees the canvas and pdf.js caches once it is further away; the document is destroyed on leaving the
score. Tested on real scans (2026-10-07): a 128-page JBIG2+JPX method book opens in ~0.3 s and paints its first
page in ~1.1–1.4 s, mid-book pages in ~0.1 s, with ~9 MB of retained JS heap; CCITT fax and vector scores too.
Layouts are **Page** (fit one whole page, the default), **Two** (a spread) and **Width**; the choice is
remembered per browser. Zoom −/+. `→`/`PageDown` and `←`/`PageUp` turn pages; inside a page taller
than the screen they scroll by 85% of the screen first.

**Drawing.** Tools, with keys: select `V`, pen `P`, highlighter `H`, eraser `E`, text `T`, line `L`,
arrow `A`, box `R`, circle `O`, stamp `S`. Six ink colours and four highlighter colours, three sizes.
Stamps: fingers 1–4 and T, strum ↑↓, P/H/S, repeat signs, ✓ and !. Select to move; `Delete` removes;
double-click text to edit. `Ctrl+Z` / `Ctrl+Shift+Z`. A drag (move or erase) is one undo step.

**Bookmarks.** "🔖 Bookmark" under the score saves the current page and offset with a name; the jump
bar scrolls back to it.

**Saving.** 800 ms after the last change the document is PUT; the server describes which pages
changed. Hiding the page or leaving the piece sends a keepalive save and a flush. A failed save is retried
(2 s, 5 s, 15 s, then every 30 s) with a visible "Drawings not saved yet" strip; if the existing drawings could not
be loaded, drawing is paused (with Retry) so a save can never overwrite them.

Files: `apps/web/src/score/*`, `apps/web/src/annotate/*`, `DataRepo.putAnnotations`.
Tests: `history`, `geometry`, `turn` unit tests; `e2e/annotate.spec.ts`.
