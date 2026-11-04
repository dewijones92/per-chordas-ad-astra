---
title: Chord names over the left hand, worked out by the app
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0023 · Chord names over the left hand

## Context

Dewi, 4 Nov 2026: he plays piano and learns from these scores, and wants the chord each bar of the left hand
makes written on the falling notes (G, Am, D7, C/E), the way a guitar chart or a lead sheet reads. The scores carry
no chord symbols (Gran Vals has none), so the app has to name the harmony from the notes.

## Decision

- **A pure module, `music/chords.ts`.** `nameChord(pitches, flats)` names a set of sounding pitches and
  `chordLabels(notes, bars, transpose, flats)` walks the bars and returns `{ start, name }` labels. It works on
  pitch classes plus the lowest note, so octaves and doublings do not matter.
- **The window is the bar.** A waltz bar is bass, chord, chord, and one name must come out of all three, so the
  notes that start in the bar are taken together (bass G + B D = G). Where that is not enough: a bar of four or
  more beats that is an even number (4/4, 6/8, 2/2) is read as two halves when each half names a chord of its own,
  because 4/4 often changes chord mid-bar; a bar the whole of which names nothing falls back to its two halves.
  Beats are not used as windows: an Alberti or waltz bass would read as three different "chords" a bar.
- **A name is an exact match.** The set of pitch classes above a candidate root must equal a template: major, minor,
  7, m7, maj7, dim, aug, sus2, sus4, m7♭5, dim7, 6, m6, m(maj7), add9, madd9, 7sus4, a seventh without its fifth, and
  a bare third (a waltz bass often leaves out the fifth, so G + B reads G and A + C reads Am). The root is the lowest
  note when the set allows it (so A C E G is Am7 over A and C6 over C); otherwise the best-ranked root is used and
  the lowest note follows a slash (C/E, G7/B). When no name fits, the lowest note is set aside and the notes above it
  are tried, giving a slash chord over a bass that is not in the chord (A and C over D is Am/D). A single note, an
  octave, a bare fifth, a cluster and anything over five different notes are left unnamed: nothing is better than a
  wrong name. Each such bar is counted in the `dewidebug chord names` log line with the first few bar numbers.
- **Only a new harmony is labelled.** A label is dropped when its root and quality equal the previous one's, ignoring
  the bass, so a waltz bass that alternates D and G under one G chord does not flicker between G/D and G. A bar that
  names nothing resets this, so the same chord after a gap is labelled again.
- **Left hand means the lanes' left hand.** The notes are those the fingering suggestion treats as left
  (`sideOfNote`, which wraps `sideFor`): a lane whose role is left, otherwise anything below middle C. Notes left out
  by Thin octaves are not counted. A hidden hand still counts, since reading chords off the hidden hand is a use.
- **Spelling and transposition follow the sounding key.** Pitches are shifted by the transposition before naming,
  and flats are used when the key it now sounds in has flats (as Note names do, `keys.ts`).
- **Drawing.** `drawFalling` draws each label as a fixed 16 px sticker at the left edge of the notes area, sitting
  on the line where the chord starts, over the notes. A label is skipped if it would overlap the one below it, so
  fast changes thin out instead of piling up. It does not avoid note-name labels; the sticker is drawn last. The
  canvas reports the drawn names in `data-chords`.
- **A switch, off to start with** (`chords` in the play-along preferences, a zod default so older files read as off),
  remembered per file.

## Consequences

- On the real Gran Vals file 43 of its 129 bars name a chord (31 labels after merging); the rest are single bass notes,
  melodic bars or sets with no name, and show nothing.
- Chords are as good as the left hand is a chord: arpeggios and passing notes can give a wrong or no name. It is a
  reading aid, not a harmonic analysis, and it does not use the right hand.
- A bar whose chord changes at a place other than the middle shows only one name.
