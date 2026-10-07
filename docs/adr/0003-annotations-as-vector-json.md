---
title: Store annotations as vector JSON in PDF points beside the original PDF
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0003 · Annotations are vector JSON, the PDF is never modified

## Decision

Each score has `annotations/<file>.json`: per page, a list of items (stroke, text, shape, stamp)
validated by zod in `packages/shared`. Coordinates are **PDF points**, the same space as the page's
own viewBox, so drawings stay put at any zoom or layout.

## Why

Editable for ever (select, move, erase, undo), diffable in git, small, and the original score stays
pristine. Flattening into the PDF would be lossy and make every edit a binary diff.

## Consequences

- Exporting a flattened PDF is a separate feature (backlog).
- Pen strokes render with perfect-freehand; highlighter strokes are polylines with multiply blending.
