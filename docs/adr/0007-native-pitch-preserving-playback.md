---
title: Slow down backing tracks with the browser's pitch-preserving playbackRate
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0007 · Native pitch-preserving playback for the looper

## Context

The plan named SoundTouch (an AudioWorklet port) for slowing tracks without changing pitch.

## Decision

Use `HTMLAudioElement.playbackRate` with `preservesPitch = true`. Every current browser time-stretches
natively, so it needs no dependency or worklet. Loops wrap in a `requestAnimationFrame` loop, accurate
to a frame.

## Consequences

- Quality is the browser's; Chrome's is good to about 60–70%. Rubber Band (WASM) stays on the backlog
  if lower speeds sound poor.
- This deviates from the approved plan; recorded here and reported to Dewi.
