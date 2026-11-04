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

## Consequences

- Your own fingering (next) goes on top of the file's, keyed to the same written note.
