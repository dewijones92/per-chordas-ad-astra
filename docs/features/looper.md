---
title: Slow-down looper
status: shipped
updated: 2026-10-07
---

# Slow-down looper

- Upload backing tracks (MP3, M4A, OGG, WAV, FLAC; up to 50 MB) per piece.
- Speeds 50–125% with pitch preserved by the browser ([ADR 0007](../adr/0007-native-pitch-preserving-playback.md)).
- A waveform (decoded once, 480 peaks): click to seek, drag to select a loop. Or press **A** then **B**
  while playing. Loops wrap on the next animation frame.
- Save loops by name with their speed into `loops.json`, **one track at a time** (`PUT /api/pieces/:id/loops/:track`),
  so a save can never wipe another track's loops; Save is disabled until the saved loops have loaded. Removing a
  track removes its loops.
- A loop that ends at the very end of the track keeps looping (the `ended` event wraps it).
- The server serves byte ranges, so seeking works.

Files: `apps/web/src/looper/*`, `apps/server/src/http/serve-file.ts`.
Tests: `test/looper.test.ts`, `apps/server/test/http.test.ts`, `e2e/practice.spec.ts`.
