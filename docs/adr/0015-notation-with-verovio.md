---
title: Draw the notation with Verovio, follow it with our own timeline
status: accepted
date: 2026-10-24
updated: 2026-10-24
---

# 0015 · Notation beside the falling notes: Verovio, fed MusicXML, driven by our play order

## Context

Dewi wants to see the score and the falling notes at the same time. A PDF can already sit beside the
notes, but it cannot follow playback, and his MuseScore files have no PDF. He agreed to try Verovio.

## Decision

- **Verovio 6.3** (LGPL-3.0, used unmodified as a separate module) renders MusicXML to SVG in a **Web
  Worker** (`music/notation.worker.ts`), as one long line that scrolls sideways above the falling notes.
  The worker chunk is about 8 MB and loads only when the notation is shown; it is cached after that.
- Verovio does not read MuseScore files, so **`music/to-musicxml.ts`** converts our MuseScore model to
  MusicXML: spelling from `tpc`, voices, rests, tuplets, ties, grace notes, slurs, clefs, beams (MuseScore
  stores only overrides, so default beaming is computed by beat and the overrides honoured), endings,
  repeats, markers, jumps and tempo offsets. MusicXML files are shown as they are. Slurs come from 2.x
  `<Slur type>` on the chord, and from the `<Spanner type="Slur">` that 3.x (and, by the same layout, 4.x)
  writes inside the chord; the batch review (24 Oct 2026) found 3.x files losing every slur. One slur per
  chord is written, so a chord starting two slurs at once (an octave grace in Gran Vals) draws one.
- **The play order stays ours.** Verovio would expand repeats its own way, so it runs with
  `expandNever` and its timemap is in written-score quarters. The playing position maps through our
  unrolled bars: the bar being played and how far through it, giving a written-score quarter, whose
  sounding notes are coloured. Our bar _i_ is Verovio's bar _i_.
- **One key everywhere.** Verovio is given an exact interval (`intervalFor`, e.g. `-m2`), chosen so
  that it lands on the key our key line and note names show. Checked against Verovio for all 13 keys and
  every transposition from −24 to +24 (624 cases, 0 differences).

## Consequences

- A round-trip test guards the converter: every MuseScore file converts to MusicXML that our own reader
  plays identically (bars and notes exactly, grace notes by pitch). Building it found two real bugs in
  the MuseScore reader: local time signatures (fixed) and 2.x voices written as a chord's own track.
- MuseScore-only layout (spacing, system breaks, positions) is not reproduced; MusicXML gives Verovio's
  own engraving. Lyrics, fingering, articulations and dynamics marks are not converted yet.
- Section breaks do not exist in MusicXML, so a section whose repeat relied on an implied start gets an
  explicit start-repeat barline in the notation.
