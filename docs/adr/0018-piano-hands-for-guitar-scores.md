---
title: Piano hands for guitar scores, worked out by the app
status: accepted
date: 2026-10-30
updated: 2026-10-30
---

# 0018 · Piano hands for guitar scores: an automatic split, switchable

## Context

Dewi plays Tárrega's Gran Vals on piano from the most popular MuseScore file of it (musescore.com score
5277903). That file is the guitar layout entered as two single-staff parts, both called "Piano", in the guitar
clef. In bar 17 one part holds an octave while the other plays chords inside it: natural on guitar, but on
piano one hand has to sit inside the other. A Gemini review blamed the app's parsing; the file was read
faithfully, and there is no free piano arrangement on MuseScore (searched 30 Oct 2026), so the fix belongs in
the app and helps every guitar piece. Dewi chose (30 Oct 2026): an automatic split with a **By part / By hand**
switch; a **strike + thin tail** switch for long notes; the notation redrawn as a **grand staff** from the split,
in this batch.

## Decision

- **The app assigns hands, not the file.** `music/hands.ts` groups notes that start together (within 30 ms)
  and, at each moment, tries every cut of the new notes into lower (left) and upper (right). Each cut is costed:
  hands overlapping, counting notes still held, costs 1000 per semitone of overlap; a hand wider than an octave
  costs 40 per extra semitone; more than five notes in a hand costs 500 each; every semitone of a hand's span
  costs 1; the left hand above E4 or the right below G3 costs a little; moving a hand costs half a semitone per
  semitone. A beam search keeps the 32 cheapest histories, so a held octave at the start of a bar is split to
  leave room for the chords that follow. On the real Gran Vals file the part layout crosses at 79 moments; the
  split crosses at none, has two moments wider than an octave, and takes about 80 ms.
- **By hand is a view, not a new performance.** The player keeps the same notes, and each note is mapped to a
  lane (part or hand), so the falling notes, key colours, hide and mute follow the lane and switching does not
  restart playback. The lanes are 🫱 Right hand and 🫲 Left hand, in the usual right/left colours.
- **Its default follows the instrument.** `byHand` is unset until chosen: it starts on when 🙋 I play on is
  Piano and the score has no two-handed staff of its own (a real piano score keeps its RH/LH staves), and off
  otherwise. I play on starts as Guitar when a part's name says guitar. Both, and the hands' own hide and mute
  lists, live in the play-along preferences, so they are remembered per file and will be per person.
- **🔔 Ringing tails** (a switch, off to start with) draw each note as a 0.2 s strike plus a thin tail while it
  rings, light the key only for the strike, and tell the hand split that the key is released after the strike
  (`keyUpAt`), since the pedal holds the sound. There is no pedal data in these files, so this is a reading
  choice, not a MIDI CC64 event.
- **The notation follows the split as a grand staff.** By hand, a MuseScore file's notation is rebuilt as one
  piano part (`music/grand-staff.ts`): each chord's notes go to the treble staff (right hand) or the bass staff
  (left hand), each source voice is packed bar by bar into the first voice on its new staff that it does not overlap in time, rests are left to the gaps (a staff with
  nothing in a bar gets a bar rest), tied notes stay in the hand that struck them, and the clefs become plain
  treble and bass, so the guitar's octave clef goes. Performance notes now carry their `source` score note, which
  is how a played note's hand reaches the written note (its first playing decides, for repeats). Highlighting
  still comes from Verovio's own timing, so it works unchanged. Exports keep the file's own layout.

## Consequences

- Any guitar piece opened for piano gets playable hands without editing the file; hands can be practised
  separately by muting or hiding one.
- The split is a heuristic: it can choose a fingering a pianist would not, and nothing yet lets you move one
  note to the other hand (offered to Dewi as a later option).
- Drawings on the notation stay on their bars in either view, but a mark's height is measured from the top staff
  line, so a mark drawn in one view can sit at a different height relative to the notes in the other.
- The grand staff needs a MuseScore file (we hold its engraving); a MusicXML file keeps its own staves.
