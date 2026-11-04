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
  speed, ✂️ thinning and hiding a hand. Each keypress saves just that note (never the whole file), and the commit
  says which: "Finger 3 on B4 in bar 1 of 'Gran Vals' (gv.mscz)". The hint showing which note is picked floats over
  the falling notes so nothing above them moves.

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

- Fingering added by clicking the stave, and your fingering drawn on the stave, are a follow-up; today your numbers
  show on the falling notes (the file's show on both).
- If the music file is replaced by a different edition, keys that match no note are simply not drawn.
