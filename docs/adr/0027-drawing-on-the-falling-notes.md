---
title: Drawing on the falling notes: marks pinned to a written pitch and a bar, falling with the music
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0027 · Drawing on the falling notes

## Context

Dewi, 4 Nov 2026: "I'd like to be able to draw on the bird's eye view coming down… the notes would flow just like
the notes, but I want to be able to draw where I want." Offered a choice of tools, he chose the same ✏️ tools as on
the PDF and the stave (pen, highlighter, text, arrows and lines, shapes, stamps, eraser, select, undo and redo),
drawn on the Play-along falling notes and falling with the music. The marks are drawn only, never played, and shared
between the people like the other drawings (ADR 0019).

## Decision

- **One drawing system.** The falling notes use the same `AnnotationLayer`, toolbar, keys, history reducer, text
  box and autosave as the PDF and the stave (ADR 0016). Nothing new draws, saves or undoes; the new code only
  converts between the screen and musical places (`music/falling-marks.ts`) and hosts the layer over the canvas
  (`music/FallingMarks.tsx`).
- **A mark's place is musical, not pixels.** In the saved file x is a **written pitch** in semitones, a fractional MIDI
  number (60.5 is half way from middle C to C♯), and y is a **bar and a fraction of it**: the page key is the written
  bar's position (1-based, in the file's order, not the play order, as in ADR 0016) and y is how far through that
  bar, 0 at its start and 1 at its end. A stroke that runs past the bar it started in keeps going on the same scale
  (y below 0 or above 1) and belongs to the bar it started in, as on the stave. Written pitch means a mark stays with
  its notes when the key is transposed; the bar fraction, worked out from each pass's real seconds, means it stays
  with its notes through speed changes, a different 🔭 look-ahead, the canvas height, a fitted keyboard or all 88
  keys, and a tempo change inside the bar.
- **The keyboard axis.** A pitch becomes an x by joining the middle of each key with straight lines (the white keys
  are evenly spaced and the black keys sit between them, so a semitone is not a fixed width), carried on past both
  ends at the end slopes so a mark just outside the fitted range keeps its place. Going back is the same line read
  the other way.
- **Repeats.** A mark in a bar that plays more than once shows on **every** pass, as the notes do, each pass worked
  out from its own length. A mark is one thing: erasing, moving or editing it on any pass changes it on all of them,
  and the commit names the written bar. A bar the music never plays (an ending left out) has no place on the falling
  notes, so its marks are kept and not shown.
- **Drawn in "time space", moved by one attribute.** The overlay is one SVG over the notes area whose x is the
  screen x and whose y is minus the seconds times the pixels per second. Playback only slides the SVG's `viewBox`
  origin once a frame (written directly, so React does not render per frame); the marks themselves are drawn again
  only when the music, the look-ahead, the size, the key or the drawings change. Pen width, text and stamps keep
  their on-screen size (the notes' own labels do the same); a drawn circle or box stretches with the notes when
  the look-ahead changes, as the note it surrounds does.
- **Drawing is part of Draw mode.** ✏️ Draw now exists for MIDI files too, which have no stave. In Draw mode both the
  stave and the falling notes can be drawn on with one toolbar and one set of tool settings. The surface last
  pressed owns the keys (`claimDrawing('falling')` beside `'notation'` and `'score'`), so `Ctrl+Z` undoes the marks
  of the surface you last drew on and never another one's. With no stave on screen the falling notes own the keys.
  Starting playback leaves Draw mode as before. Outside Draw mode the marks show, but the overlay does not take the
  pointer: a click still picks a note for fingering, a drag still scrubs and the wheel still scrubs. In Draw mode
  the mouse wheel and `Ctrl`+wheel still move through the music and the look-ahead, so a mark can be drawn
  anywhere in the piece.
- **Saved as its own file.** `annotations/<music file>.falling.json` beside the stave's `annotations/<music
file>.json`, the same `Annotations` shape, read by `GET` and changed by `PATCH` (ADR 0030)
  `/api/pieces/:id/annotations/:file/falling` (music files only), through the same autosave and retry
  (`useAnnotations(…, 'falling')`). It is removed with the music file. Commits read
  `Draw on the falling notes in 'Gran Vals' (gran-vals.mscz bar 12)`.

## Consequences

- A mark drawn over a bar and a half is cut loose from any bar after the first if the music is edited, as on the
  stave. It stays on the notes through everything the app does itself.
- A mark far left or right of the keyboard (off the visible range) is stored and shows again if the range grows.
- The text box does not follow the notes if the music is scrolled while it is open; it saves at the place it was
  started.
- The notes area gets half the pane in Draw mode when the stave is showing (the stave strip used to take
  three quarters of it).
- Hit testing, the eraser and the selection box work on the pass the pointer is over, and act on every pass.
