---
title: What per-chordas-ad-astra is
updated: 2026-10-07
---

# Spec

A personal guitar practice workspace for one player (Dewi), used on a laptop, reached through the Pi's
Google gate. It replaces a folder of PDFs, a phone metronome, a notebook and a separate tuner.

## Must never break

1. **No practice data is lost.** Every change reaches the Pi's disk at once and GitHub within about
   20 s (or on leaving a piece, hiding the page, or shutdown). If GitHub is unreachable, commits wait
   and retry, and the pill says so.
2. **The original PDF is never modified.** Drawings live beside it.
3. **Drawings stay where they were drawn** at any zoom, layout or screen size.
4. **The metronome keeps time.** Sample-accurate scheduling, no drift over an hour (unit tested).
5. **The data repo stays readable by a human**: plain JSON with one point per line, JSONL logs,
   commit messages that say what changed.
6. **Nobody gets in without the Google gate**: the app trusts only the nginx network.

## Out of scope (for now)

Multi-user, offline/PWA, a mobile layout, stylus pressure tuning, notation playback. See
[todos](todos/_index.md).
