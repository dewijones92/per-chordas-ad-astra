---
title: Fingering, read from the file and shown in red
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0021 · Fingering, read from the file and shown in red; a file check says what the file is for

## Context

Dewi, 4 Nov 2026, learning piano from scores that are often guitar arrangements saved as "Piano" (the popular Gran
Vals file names keyboard.piano in both its single-staff parts): he wants to tell deterministically whether a file
was written for piano, so he knows whether its fingering can be trusted, and he wants to see and add fingering as
red numbers on the notes. The readers dropped fingering entirely.

## Decision

- **The readers keep fingering on each note** (`ScoreNote.finger`, `EventNote.finger`), with its kind: MuseScore's
  `<Fingering>` with its saved style (`fingering`, `lhGuitarFingering`, `rhGuitarFingering`, `stringNumber`, any
  spelling), MusicXML's `<technical>` `fingering`, `pluck` and `string`. Where no style says, the text decides: 1–5
  piano, 0 an open string, p i m a guitar right hand; a plain number on a guitar part is a guitar left-hand finger.
  The MuseScore → MusicXML conversion writes it back, so the stave shows it.
- **No file says for certain what it was written for**, so the **🔎 File check** shows the three clues and a verdict:
  the instrument the file names (its instrument id, else the part names), the layout (one part on two joined staves;
  single staves; guitar tab) and the fingering marks by kind. ✅ Written for piano needs piano named and the grand
  staff with no guitar clue; any guitar clue (named, tab, more guitar than piano fingering) says 🎸 guitar; anything
  else is ⚠️ not clearly piano. A ❓ explains it.
- **Piano fingering shows in red**: a red number on a white badge on the falling note (14 px whatever the zoom,
  in the same label slot as note names, so it never stacks on another label), and red on the stave (Verovio's
  `fing` class). Guitar fingering is counted in the check but not drawn on the falling notes, where it would mislead
  a pianist.

- **Your own fingering** (Dewi: click a note, press 1–5, red; shared between the people, like drawings): click a
  falling note (a click, not a drag, which still scrubs), press **1–5**; Backspace, Delete or 0 clears it and Esc lets
  go. It replaces the file's mark on that note. It is stored per music file in `fingering.json` in the data repo,
  keyed by the **written** note (`s<staff>m<measure>t<tick>p<pitch>`), so it follows the note through transposing,
  speed, ✂️ thinning and hiding a hand. A grace note before the first beat has a negative tick, so the key allows a
  minus sign (`t-60`); every key already saved stays valid. Each keypress saves just that note (never the whole file), and the commit
  says which: "Finger 3 on B4 in bar 1 of 'Gran Vals' (gv.mscz)". The hint showing which note is picked floats over
  the falling notes so nothing above them moves. The number shows at once, and `FingerSaves` keeps the last
  **confirmed** fingering: a save that fails (even when the reload fails too) puts the screen back to it, and replies
  are applied by request order, so two quick saves answered the wrong way round never drop the second (red first,
  4 Nov 2026).

- **Your fingering on the stave** (4 Nov 2026, built by Claude as the follow-up to the above): your numbers are drawn
  red on the stave, exactly where a printed fingering goes, and a note picked on either view is marked on both.
  - _Into the stave, one rule, two producers._ The stave is drawn from MusicXML, so your fingers are merged into that
    XML as `<technical><fingering>`, replacing any fingering, pluck or string mark the file had on the same note. A
    MuseScore file's XML is generated from our score model, so `withUserFingers` sets `finger` on the model's notation
    notes before the XML is written (and before the by-hand grand staff splits the hands, because your keys use the
    staff the file wrote the note on, not the hand it is redrawn in). A MusicXML file's own text is kept, so
    `fingeredMusicXml` re-reads it with `parseMusicXml`, which now hands back each note's source element, and writes
    the mark into that element. Both are reached through `staveSourceXml`; with nothing fingered the file's own text
    or XML is used untouched. Verovio transposes at draw time, so the fingers ride along at any transposition.
  - _Click a stave note._ The worker asks Verovio for each drawn note's sounding pitch next to the time map
    (`getMIDIValuesForElement`); `matchStaveNotes` matches a drawn note to a written one by bar, place in the bar
    (within 3 ticks) and pitch minus the transposition, giving two unison notes their own written note. Staff is not
    used, because the grand staff changes it. The pick is the one the falling notes use (`pickWritten` in
    PlayAlong, the same hint, keys and save). A click that lands on the empty middle of a hollow head, which draws
    nothing to hit, picks the nearest head within 8 px (`nearestNote`).
  - _Seeking and drawing._ A note click also seeks to its bar, as every click on the stave always has; a click on the
    bar anywhere else seeks and lets go of the picked note; in Draw mode stave clicks are drawing's and pick nothing.
    Starting Draw mode lets go of the picked note, and the finger keys (1-5, Delete, Backspace) are not read while
    drawing, so Delete removes the selected mark and never a saved finger (red first, 4 Nov 2026).
  - _The stave does not flash or jump._ Its identity key no longer depends on the XML text, so a finger change keeps the
    old drawing on screen until the new one is ready, and the stave does not scroll back to the playing bar.
  - _Limits._ A grace note is not matched, and picking is off when our bar count and Verovio's disagree.

- **🤖 Suggested fingering** (Dewi approved the idea, 4 Nov 2026): wherever neither the file nor you has given a
  finger, the app draws its own suggestion in **grey** (red always wins). Our own code, no library
  (`suggest-fingering.ts`): per hand, the notes are grouped into onsets and a best-path (Viterbi) search over finger
  choices minimises a cost adapted from Parncutt-style rules: stretch away from a relaxed span for each finger pair,
  past a comfortable span costs more, thumb-under and finger-over only with the thumb (3 cheapest, then 4, then 2),
  thumb on a black key, same finger on a new key; chords take rising fingers in the right hand and falling in the
  left. A leap wider than a fifth is a lift of the hand, not a stretch, landing on the outer finger when it moves
  outward (so a waltz bass gets 5 and its chords 3-1). Checked against the C major scale in each hand, a five-finger
  position, triads, Gran Vals and Chopin's C minor Prelude. A tick box switches it off, per file.

## Consequences

- The suggestion is a sensible first guess, not an edition: the first note of a piece has no context and may get
  an odd finger, and repeats are fingered pass by pass.

- If the music file is replaced by a different edition, keys that match no note are simply not drawn.
