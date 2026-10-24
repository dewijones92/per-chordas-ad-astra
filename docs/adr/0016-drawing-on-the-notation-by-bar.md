---
title: Drawing on the notation, pinned to bars, with the PDF's drawing tools
status: accepted
date: 2026-10-24
updated: 2026-10-24
---

# 0016 · Drawing on the notation: the PDF's tools, marks pinned to bars

## Context

Dewi, 24 Oct 2026, on Gran Vals (a MuseScore file with no PDF): "usually … we can write on the page, but I
can't see that we can with this." Offered an app-made PDF, drawing on the notation strip, or exporting PDFs
from MuseScore himself, he chose **drawing on the notation strip**, in a **✏️ Draw mode** that pauses and gives
the strip most of the pane, with **all the PDF tools**. The same day he asked for an easy way to **zoom the
notation** to see about four bigger bars.

## Decision

- **One drawing system.** The notation uses the PDF's drawing layer, toolbar, keys, undo history, text box,
  save-with-retry and storage unchanged (`annotate/`), with the PDF-only parts lifted out so both share them:
  `useDrawing` (tools, selection, shortcuts), `useTextEditing`, `DrawingStatus`, `ZoomControl`,
  `useWheelZoom`, `useRememberedZoom`.
- **A bar is a page.** Drawings are saved per music file in `annotations/<file>.json`, the same file and
  format as a PDF's, with the written bar's position (1-based, in the file's order, not the play order) as
  the page key. Each bar gets its own layer over the engraved bar; a mark's x is measured from where the bar's
  music starts (after any clef, key or time signature in front of its first note, so a wider key signature after
  transposing does not move bar 1's marks off their notes; the batch review measured a 31 px drift before this)
  and its y from the top staff line, in Verovio units at 100% scale. Transposing, zooming or a new
  engraving moves the marks with their bars. Commits read `Annotate 'Gran Vals' (gran-vals.mscz bar 12)`, and
  removing the music file removes its drawings.
- **Which surface owns the keys.** With a PDF and the notation both on screen, ✏️ Draw mode claims the
  drawing keys (`claimDrawing`), so `Ctrl+Z` undoes the notation's marks and never the PDF's.
- **Zoom is one setting.** The strip's 🔍 −/+, `Ctrl`+scroll or a pinch over the strip, and the Draw
  toolbar's zoom all change the same zoom, 40–250% of the base size (about 11 bars across at 100%, about 4 at
  250%), remembered per music file on every device like a PDF's (ADR 0013). Draw mode raises it to at least
  150% when it opens, visibly, rather than multiplying it behind the number shown.

## Consequences

- A mark that runs across bars belongs to the bar it started in; if a later engraving widens the bars it
  crosses, its far end does not stretch with them. Fingerings, circles and short notes are unaffected.
- If Verovio and our reader disagree on the number of bars, drawing is switched off for that file with a
  message, rather than pinning marks to the wrong bars.
- The eraser and select hit only marks belonging to the bar under the pointer.
- Inside a bar, x is an absolute distance, not a proportion: if transposing adds accidentals that push the
  bar's later notes along, marks on those notes can drift by an accidental's width.
