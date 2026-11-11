---
title: Score viewer and annotation
status: shipped
updated: 2026-11-11
---

# Score viewer and annotation

**Viewing.** pdf.js renders a page to a canvas when it comes within 1½ screens of the score panel, at device pixel
ratio, and frees the canvas and pdf.js caches once it is further away; the document is destroyed on leaving the
score. Tested on real scans (2026-10-07): a 128-page JBIG2+JPX method book opens in ~0.3 s and paints its first
page in ~1.1–1.4 s, mid-book pages in ~0.1 s, with ~9 MB of retained JS heap; CCITT fax and vector scores too.
Layouts are **Page** (fit one whole page, the default), **Two** (a spread) and **Width**; the choice
follows you between devices. **🔼 Fewer controls**, beside the layouts in the Score view (11 Nov 2026, Dewi: "I
thought we did a button that removed all the vertical waste ... I can't do it on this. Is it only on the piano
pieces?"), hides the app's top menu and the piece's title bar as it does in Notes and Both, so a fitted page grows
taller; ⬅️ Library, the view switch and the save status move to the top of the right-hand column. It follows you
between devices, and 🔽 More controls brings the bars back. In Notes and Both the play-along's own Fewer controls
does this instead. Zoom −/+, or on the piece page `Ctrl` `+`/`−`/`0` and `Ctrl`+scroll or a trackpad pinch, which zoom the score instead of the whole browser (40–250%); each score keeps its own zoom, on every device (ADR 0013). `→`/`PageDown` and `←`/`PageUp` turn pages; inside a page taller
than the screen they scroll by 85% of the screen first.

**Drawing.** Tools, with keys: select `V`, pen `P`, highlighter `H`, eraser `E`, text `T`, line `L`,
arrow `A`, box `R`, circle `O`, stamp `S`. Six ink colours and four highlighter colours, three sizes.
Stamps: fingers 1–4 and T, strum ↑↓, P/H/S, repeat signs, ✓ and !. Select to move; `Delete` removes;
double-click text to edit. `Ctrl+Z` / `Ctrl+Shift+Z`. A drag (move or erase) is one undo step.
The same tools draw on a Play-along notation strip in its ✏️ Draw mode (ADR 0016); there the drawing keys
belong to the notation, so `Ctrl+Z` never undoes the PDF's marks.

**Marks from other apps.** The first time a score opens, marks made in other apps (Preview's handwriting, highlights, strike-outs, lines and text boxes) are copied into the app's own drawings, with the same shape, colour and place, and the PDF's copies stop being painted, so each mark shows once and can be selected, moved, erased and undone. The PDF file itself is untouched. If a PDF holds a kind of mark the app cannot convert, it is left exactly as it was. See [ADR 0011](../adr/0011-import-pdf-annotations-as-drawings.md).

**Bookmarks.** "🔖 Bookmark" under the score saves the current page and offset with a name; the jump
bar scrolls back to it.

**Saving.** 800 ms after the last change what changed since the last save is sent (`PATCH`: the marks added or
edited, and the ids removed; ADR 0030), and the server applies it to what it holds, so marks made meanwhile in
another tab or by the other person are kept. It describes which pages changed. Hiding the page or leaving the piece sends a keepalive save and a flush. A failed save is retried
(2 s, 5 s, 15 s, then every 30 s) with a visible "Drawings not saved yet" strip; if the existing drawings could not
be loaded, drawing is paused (with Retry) so a save can never overwrite them.

Files: `apps/web/src/score/*`, `apps/web/src/annotate/*`, `DataRepo.changeAnnotations`, `packages/shared/src/annotation-changes.ts`, `DataRepo.importPdfMarks`.
Tests: `history`, `geometry`, `turn`, `zoom`, `pdf-marks` unit tests; `e2e/annotate.spec.ts`, `e2e/zoom.spec.ts`, `e2e/pdf-marks.spec.ts`.
