---
title: Store annotations as vector JSON in PDF points beside the original PDF
status: accepted
date: 2026-10-07
updated: 2026-11-11
---

# 0003 · Annotations are vector JSON, the PDF is never modified

## Decision

Each score has `annotations/<file>.json`: per page, a list of items (stroke, text, shape, stamp, ink)
validated by zod in `packages/shared`. Coordinates are **PDF points**, the same space as the page's
own viewBox, so drawings stay put at any zoom or layout.

## Why

Editable for ever (select, move, erase, undo), diffable in git, small, and the original score stays
pristine. Flattening into the PDF would be lossy and make every edit a binary diff.

## Consequences

- Exporting a flattened PDF is a separate feature (backlog).
- Pen strokes render with perfect-freehand; highlighter strokes are polylines with multiply blending.
- `ink` items are filled outlines imported from a PDF's own annotations ([0011](0011-import-pdf-annotations-as-drawings.md)).
- **Page turns** (11 Nov 2026) live in the same file as `turns: { "<page>": 90 | 180 | 270 }`, on top of whatever
  turn the PDF itself asks for, and the PDF still is not touched. They are shared by everyone who opens the score
  (a sideways page is a fact about the file, not a preference). Drawings stay in the page's own coordinates (the
  PDF's own turn included); the drawing layer is turned with the page as one unit, so nothing stored is rewritten
  and a pointer maps back through the turn. The first case: a PDF saved by macOS Preview with `/Rotate 270` on
  pages 3–8.
