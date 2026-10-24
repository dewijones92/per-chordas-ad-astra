---
title: Play-along reads MuseScore and MusicXML with our own parser, plays a sampled piano
status: accepted
date: 2026-10-24
updated: 2026-10-24
---

# 0014 · Our own score reader, MuseScore's repeat tests as the oracle, Salamander piano

## Context

Dewi wants MuseScore files (and MusicXML) opened, transposed and played as falling notes. He asked that
open-source code be read but not pasted, and later said any library or tool is fine if it gives the best
result. His first test file, Tárrega's Gran Vals, is a MuseScore **2.06** file; MuseScore 4 is what
MuseScore writes today.

## Decision

- **Our own parser** for MuseScore 2.x, 3.x and 4.x (`.mscx`, and `.mscz` via `fflate`) and partwise
  MusicXML, into one model (`music/model.ts`): measures with repeats, endings, markers and jumps; notes in
  ticks with ties and grace notes; tempo, dynamics and key. Rejected **webmscore** (MuseScore in
  WebAssembly): it is built on MuseScore 3, so it cannot open MuseScore 4 files, it is about 10 MB, and it
  is GPL.
- **Play order** (`unroll.ts`) is written from the rules, then checked against MuseScore's own repeat
  test files and their expected bar orders (`src/engraving/tests/repeat_tests.cpp`, 69 cases): 67 match.
  The two left are jumps into an ending that has its own repeats. The check runs when `MUSIC_CORPUS`
  points at a download of those files (`apps/web/test/music-corpus.test.ts`); they are GPL test data, so
  they are not committed.
- **Sound**: Salamander Grand Piano V3 (Yamaha C5) by Alexander Holm, **CC BY 3.0**, credited in the app.
  `tools/build-piano-samples.sh` rebuilds the 90 Opus files (30 pitches in minor thirds, three
  loudnesses, trimmed and faded, mono) from the original archive, checking its SHA-256. Opus because
  Chromium (CI's browser) decodes it and its pre-skip is honoured, so note onsets are not delayed.
- **Drawing**: a 2D canvas. WebGPU was considered; a few hundred rectangles a frame do not need it, and it
  is unreliable on Dewi's WSL.
- **Scheduling**: the audio clock is the truth. A pure `Transport` maps audio time to song time through
  anchors, schedules 150 ms ahead, and wraps loops without a gap; the canvas reads the same clock.
- **Where things are kept**: transposition is part of the piece, so it is in `piece.json` (git). Speed,
  loop, hidden/muted parts, keyboard size and position are practice state, in the resume state on the Pi
  (ADR 0010), as is the chosen view.

## Consequences

- MuseScore features that only change appearance are ignored; ones that change playback but are not yet
  read (ottava lines, swing, pedal, articulations) play as written.
- Notation is not drawn from the file. If that is wanted, an engraver (for example Verovio, LGPL) would
  need MusicXML; MuseScore files would first need converting.
