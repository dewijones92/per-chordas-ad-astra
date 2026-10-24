---
title: Play-along (MuseScore and MusicXML, falling notes, transpose, loop)
status: shipped
updated: 2026-10-24
---

# Play-along

Dewi, 24 Oct 2026: open MuseScore files in the app, transpose them, and watch the notes fall onto a
keyboard from above, like the bird's-eye piano videos.

- **Files**: `.mscz`/`.mscx` from MuseScore 2, 3 and 4, and MusicXML `.mxl`/`.musicxml`. Upload from the
  piece's **🎹 Play-along** section; stored untouched under `pieces/<slug>/music/`.
- **Views** (top of the piece page, only when the piece has a music file): **📄 Score** (the PDF),
  **📄🎹 Both** (PDF on the left, falling notes on the right) and **🎹 Notes** (falling notes only). A piece
  with music but no PDF opens in Notes. The view is remembered per piece, on every device.
- **Falling notes**: notes fall onto a keyboard fitted to the piece in whole octaves (at least three), or
  all 88 keys. Sounding keys light up in their part's colour: right hand violet, left hand teal, other
  parts coral, blue, amber. Bar lines carry their numbers. Drag or scroll the notes to move through the
  piece.
- **Parts**: each staff can be hidden (👁, still heard) or muted (🔊, still shown) on its own, to practise one
  hand while the other plays.
- **Sound**: a sampled grand piano (Salamander, CC BY 3.0, credited in the section), 30 notes in minor
  thirds at three loudnesses, about 3 MB, loaded on the first Play. Dynamics in the file set the loudness.
- **Play order**: repeats, first and second endings, D.C., D.S., al Fine, al Coda and section breaks are
  played as MuseScore plays them (checked against MuseScore's own repeat tests, ADR 0014).
- **Transpose**: − / + by semitone (±24). Shows the written key and the key it now sounds in, minor where
  the file says so, and for transposing up, the capo fret that keeps the written shapes on guitar. Saved
  in `piece.json`, so it opens in your key everywhere; the commit says `Transpose <file> to +2`.
- **Loop**: drag across bars on the **bar strip** above the notes, or use From here / To here. Click a bar
  to jump to it, Shift+click to stretch the loop. **Speed up each loop** adds 5% every time round until
  full speed; the change happens exactly at the loop point, so no note is cut. Speed (25–200%) and the loop are remembered per file, on every device.
- **Keys**: K play/pause, `[` `]` slower/faster, `,` `.` previous/next bar. Space plays in the Notes view;
  where the PDF is showing, Space stays with the metronome.

Files: `apps/web/src/music/*` (`mscx.ts`, `musicxml.ts` and `load.ts` read files into one model;
`unroll.ts` decides the play order; `performance.ts` turns bars into seconds; `transport.ts` schedules;
`player.ts` plays samples; `falling.ts` draws; `PlayAlong.tsx`, `BarStrip.tsx`), `tools/build-piano-samples.sh`,
`apps/web/public/piano/`, `DataRepo.addMusic`.

Tests: `apps/web/test/music-parse.test.ts` (one waltz in six encodings gives identical notes),
`music-play.test.ts`, `music-corpus.test.ts` (opt-in, real files and MuseScore's repeat orders),
`apps/server/test/data-repo.test.ts`, `e2e/play-along.spec.ts`.

Known gaps: notation is not drawn from the file yet (the PDF does that job; next on the backlog); ottava
lines, swing, pedal and grace-note timing are approximate; two of MuseScore's 69 repeat cases (a jump into
an ending that has its own repeats) differ.
