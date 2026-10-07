---
title: Use the pdf.js legacy build, loaded lazily
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0008 · pdf.js legacy build

## Context

pdf.js 6's modern build calls `Uint8Array.prototype.toHex`, which only Chrome 140+ has. In an older
browser every score failed with "a.toHex is not a function".

## Decision

Import `pdfjs-dist/legacy/build/pdf.mjs` and its worker through a dynamic `import()`, so pdf.js loads
only when a score opens. Serve pdf.js's wasm decoders (JBIG2/JPX are common in scanned scores), standard
fonts, cmaps and ICC profiles from `/pdfjs/`, copied in at build time.

## Consequences

About 60 KB more than the modern build, and the first page load halved (857 KB → 427 KB of JS).
