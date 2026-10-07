---
title: Score viewer and annotation
status: shipped
updated: 2026-10-07
---

# Score viewer and annotation

**Viewing.** pdf.js renders each page to a canvas when it nears the viewport, at device pixel ratio.
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
changed. Hiding the page or leaving the piece sends a keepalive save and a flush.

Files: `apps/web/src/score/*`, `apps/web/src/annotate/*`, `DataRepo.putAnnotations`.
Tests: `history`, `geometry`, `turn` unit tests; `e2e/annotate.spec.ts`.
