---
title: Tuner
status: shipped
updated: 2026-10-07
---

# Tuner

- The microphone, with echo cancellation, noise suppression and auto gain off, feeds an AnalyserNode
  (4096 samples) and pitchy's McLeod pitch method. Readings below clarity 0.9 are ignored, and the
  median of the last five steadies the needle.
- It waits for two full analyser windows after starting: the first frames contain silence and read
  ~6 cents off.
- Shows note, octave, cents and Hz, plus the nearest string of the chosen tuning (Standard, Drop D, half
  step down, DADGAD, Open G, Open D) and an adjustable A4.

Files: `apps/web/src/tuner/*`. Tests: `test/tuner.test.ts`, `e2e/tools.spec.ts` (fake mic playing 110 Hz).
