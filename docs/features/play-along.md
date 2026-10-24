---
title: Play-along (MuseScore and MusicXML, falling notes, transpose, loop)
status: shipped
updated: 2026-10-24
---

# Play-along

Dewi, 24 Oct 2026: open MuseScore files in the app, transpose them, and watch the notes fall onto a
keyboard from above, like the bird's-eye piano videos.

- **Files**: `.mscz`/`.mscx` from MuseScore 2, 3 and 4, and MusicXML `.mxl`/`.musicxml`. Start a new piece
  straight from one (**+ New piece**, then the MuseScore / MusicXML field: the title and composer fill in
  from the file if still empty, and the piece opens in Play-along), or add one to an existing piece from its
  **🎹 Play-along** section. Stored untouched under `pieces/<slug>/music/`. The title and composer come from
  the file's metadata, or from MuseScore's title frame (first line only, so "Arranged by…" is left out).
- **Views** (top of the piece page, only when the piece has a music file): **📄 Score** (the PDF),
  **📄🎹 Both** (PDF on the left, falling notes on the right) and **🎹 Notes** (falling notes only). A piece
  with music but no PDF opens in Notes. The view is remembered per piece, on every device.
- **Notation** (🎼, on by default): the score drawn from the file itself, one line scrolling above the
  falling notes, with the notes being played coloured and the current bar kept in view. Click a bar to
  jump there. Transposing redraws it in the new key, the same key the key line shows (ADR 0015). MuseScore
  files are converted to MusicXML for this; MusicXML files are drawn as they are.
- **Notation zoom** (🔍 −/+ in the strip's corner, or `Ctrl`+scroll / pinch over it): 40–250%, about 11 bars
  across at 100% and about 4 at 250%; the strip grows taller to fit. Remembered per music file on every device.
- **✏️ Draw** on the notation: pauses, gives the strip most of the pane, shows the same drawing toolbar and
  keys as on PDFs (pen, highlighter, eraser, text, shapes, stamps, undo/redo) and raises the zoom to at least
  150%. Scroll sideways to any bar and draw; **✅ Done** shrinks it back, and the marks scroll with the music
  while you play. Marks are pinned to bars, so they stay on the right notes when you transpose or zoom.
  Saved per music file in the data repo (ADR 0016).
- **Falling notes**: notes fall onto a keyboard fitted to the piece in whole octaves (at least three), or
  all 88 keys. Sounding keys light up in their part's colour: right hand violet, left hand teal, other
  parts coral, blue, amber. Bar lines carry their numbers. Drag or scroll the notes to move through the
  piece.
- **Note names**: a toggle prints each note's letter on it, spelled for the key it now sounds in (flats in
  flat keys, sharps in sharp keys), following any transposition. Remembered per file.
- **Parts**: each staff can be hidden (👁, still heard) or muted (🔊, still shown) on its own, to practise one
  hand while the other plays.
- **Sound**: a sampled grand piano (Salamander, CC BY 3.0, credited in the section), 30 notes in minor
  thirds at three loudnesses, about 3 MB, loaded on the first Play. Dynamics in the file set the loudness.
- **Local time signatures** (one staff showing, say, 18/16 stretched over another's 3/4, as in Goldberg
  variation 26) play at the real bar length, with the stretched staff's notes scaled.
- **Play order**: repeats, first and second endings, D.C., D.S., al Fine, al Coda and section breaks are
  played as MuseScore plays them (checked against MuseScore's own repeat tests, ADR 0014).
- **Transpose**: − / + by semitone (±24). Shows the written key and the key it now sounds in, minor where
  the file says so, and for transposing up, the capo fret that keeps the written shapes on guitar. Saved
  in `piece.json`, so it opens in your key everywhere; the commit says `Transpose <file> to +2`.
- **Export**: 💾 MusicXML and 💾 MIDI download the piece in the key it is transposed to, named like
  `Gran Vals (+2).musicxml`. MusicXML is respelled for the new key (every key signature, key changes included, moves
  by the same interval, folded into seven sharps or flats, and each note is spelled in the key in force; the same
  rule as the key line and the notation; printed accidentals are left for the notation program to redo), so
  it opens in MuseScore or any notation program; MuseScore files go through our own converter first. MIDI
  is a type-1 file with a track per staff, repeats played out, at the written tempo shape (fixed 120 bpm
  clock, timings from the performance). Nothing is uploaded; it is built in the browser.
- **Loop**: drag across bars on the **bar strip** above the notes, or use From here / To here. Click a bar
  to jump to it, Shift+click to stretch the loop. **Speed up each loop** adds 5% every time round until
  full speed; the change happens exactly at the loop point, so no note is cut. Speed (25–200%) and the loop are remembered per file, on every device.
- **Count-in and click**: 🥁 Count-in (on by default) plays one bar of clicks at the playing speed
  before the music starts (after a pickup, the next full bar's beats); Click puts a metronome click on
  every beat while it plays, accented on the first. Compound time counts dotted beats (6/8 in two). The
  click is the metronome's own sound (`metronome/click.ts`). Pausing during the count-in silences the clicks
  already scheduled, and a seek, speed or loop change during it keeps the music waiting for the count-in to
  end.
- **Hard bits** (📌): with a loop set, **Save loop as hard bit** names it (default "Bars 12–16"). Saved
  hard bits are chips: click one to loop it, ✕ to forget it. Each remembers the **best speed** a whole pass
  has been played at: a pass counts only when it ran from the loop's start to its end with no jump, speed
  change or loop change inside it, so pausing near the end and speeding up does not count. With "speed up
  each loop" it climbs pass by pass. If the saved list fails to load, the panel says so with **Try again**
  and offers no save until it has loaded, so a new hard bit cannot replace the ones it could not see. Stored per music file in
  `hard-bits.json` in the data repo, saved one file at a time; commits read "Mark hard bit 'The run'" and
  "Hard bit 'The run' up to 75%".
- **Practice log**: play-along time logs itself (see the practice log feature).
- **Keys**: K play/pause, `[` `]` slower/faster, `,` `.` previous/next bar. Space plays in the Notes view;
  where the PDF is showing, Space stays with the metronome.

Files: `apps/web/src/music/*` (`mscx.ts`, `musicxml.ts` and `load.ts` read files into one model;
`unroll.ts` decides the play order; `performance.ts` turns bars into seconds; `transport.ts` schedules;
`player.ts` plays samples; `falling.ts` draws; `PlayAlong.tsx`, `BarStrip.tsx`), `tools/build-piano-samples.sh`,
`apps/web/public/piano/`, `DataRepo.addMusic`.

Tests: `apps/web/test/music-parse.test.ts` (one waltz in six encodings gives identical notes),
`music-play.test.ts`, `music-corpus.test.ts` (opt-in, real files and MuseScore's repeat orders),
`apps/server/test/data-repo.test.ts`, `e2e/play-along.spec.ts`.

Known gaps: lyrics, fingering, articulations and dynamics marks are not in the notation yet; ottava
lines, swing, pedal and grace-note timing are approximate; two of MuseScore's 69 repeat cases (a jump into
an ending that has its own repeats) differ.
