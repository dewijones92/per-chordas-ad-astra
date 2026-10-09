---
title: Import a PDF's own annotations as app drawings and stop painting the originals
status: accepted
date: 2026-10-09
updated: 2026-10-09
---

# 0011 · A PDF's own marks become app drawings, once

## Context

Dewi's scores carry hundreds of marks made in macOS Preview (bar timings, fingerings, highlights).
pdf.js painted them into the page canvas, so they could be seen but not selected, moved or erased.
Preview stores each handwritten mark as a **Stamp annotation whose appearance is a filled outline**,
not a centre line, so the app's pen strokes could not represent them faithfully.

## Decision

- A new drawing kind, **`ink`**: filled polygons (any colour, nonzero or even-odd), the shape the
  PDF painted, flattened from its curves. It is selected, moved, erased and undone like any drawing.
- The first time a score is opened, the browser scans its annotations (`score/pdf-marks.ts`) and
  converts them: appearance-drawn kinds (Stamp, Ink, Square, Circle, Polygon, PolyLine) to `ink` or
  pen strokes, Highlight to a highlighter stroke, StrikeOut/Underline/Squiggly and Line to lines,
  FreeText to text. Colours are kept exactly. Links and popups are ignored (they paint nothing).
- The result is posted to `POST …/annotations/<file>/import`, which applies it **only if the score
  has not been imported before** (under the piece lock), places the imported marks beneath any
  drawings already made, and records a server-owned `pdfImport` marker. Normal saves keep the
  marker, so a stale tab cannot drop it.
- Once the marker says so, pages render with pdf.js `AnnotationMode.DISABLE`, so each mark is seen
  once. The PDF file is still never modified ([0003](0003-annotations-as-vector-json.md)).
- pdf.js can hide a PDF's annotations only all together, so **if any visible annotation is a kind
  the converter does not know, nothing is converted** and the PDF shows exactly as before; the marker
  records why. A score with no marks gets a marker too, so it is never scanned again. The marker
  carries a converter version, so a later converter can retry scores it skipped.

## Why

Conversion in the browser reuses the pdf.js already loaded to render the score; doing it on the
server would mean bundling pdf.js there too. Save-once on the server makes two devices opening the
same score at once safe. All-or-nothing hiding guarantees no mark is ever lost or shown twice.

## Consequences

- Each score is converted the first time it is opened anywhere, not at upload. Drawing is never
  blocked while it runs and nothing is shown that moves the layout (a status strip above the score
  resized every page in Page layout and moved the reader's place, which failed CI); the imported
  marks are merged into whatever was drawn, moved or erased meanwhile.
- The converter reads pdf.js's drawing-instruction format, which a pdf.js upgrade could change; its
  unit test runs real pdf.js on generated annotated PDFs, so such a change fails CI.
- Measured on Dewi's five annotated scores (2026-10-09): 7, 55, 91, 69 and 68 marks, 7–88 KB of
  drawings JSON each, 130–330 ms to convert.
