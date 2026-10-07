---
title: Resume where you left off
status: shipped
updated: 2026-10-07
---

# Resume where you left off

Dewi, 7 Oct 2026: _"I always wanna resume from where I left off."_

- Opening the app at `/` goes back to the last place you were (a piece, the log or the tools page). If
  you last left from the library, it opens the library. Any other URL opens exactly that URL.
- On a piece: the score tab you last had open, scrolled back to the same page and spot (saved 300 ms after
  scrolling stops). Changing layout or zoom also keeps your place.
- The looper: same track, playback position, speed and A-B loop (saved on pause, every 2 s while
  playing, and when the page closes).
- The practice timer: an unfinished session comes back **paused** at its time so far, so a closed laptop
  never logs hours you did not practise.

Stored per browser ([ADR 0009](../adr/0009-resume-state-per-browser.md)). Files:
`apps/web/src/resume/resume.ts` plus hooks in `App.tsx`, `ScoreViewer`, `PiecePage`, `Looper` and
`PracticeTimer`. Tests: `test/resume.test.ts`, `e2e/resume.spec.ts` (seen to fail with the restore removed).
