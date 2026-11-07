---
title: Drum beats instead of the click, in the metronome and the play-along
status: accepted
date: 2026-11-04
updated: 2026-11-07
---

# 0022 · Drum beats instead of the click, in the metronome and the play-along

## Context

Dewi, 4 Nov 2026: "instead of just a metronome, I want to be able to have a drum beat instead", with a choice
between the two, and the note values (eighths, triplets and so on) selectable for both. The metronome has a
subdivision setting (♩ ♫ 3 ♬) and the play-along has its own Click, Half-beats and Count-in. Both had one sound,
`playClick`.

## Decision

- **Two modules, no sample files.** `apps/web/src/drums/grooves.ts` is pure data and pure functions;
  `apps/web/src/drums/voices.ts` synthesises the six voices in Web Audio (kick, snare, side stick, closed hat, open
  hat, ride: pitch-dropped sine, filtered noise, short tones). The metronome engine and the play-along player both
  call the same two modules; there is no second drum implementation.
- **A hit is `{ voice, level, twelfths }`.** `drumHits(groove, slot, accent)` maps one scheduler tick (beat, sub,
  subdivision) to the hits that sound on it. Patterns are lists of hits at a beat and a position in twelfths of a
  beat (0, 3, 4, 6, 8, 9 cover straight and triplet placements), so every groove is exact at every subdivision: a
  hit with no tick of its own lands on the tick before it and carries a delay (`twelfths`), which the engine turns
  into seconds (`hitSeconds`). Nothing is ever dropped, and the scheduler is untouched, so it stays drift-free.
- **The subdivision buttons set the hi-hat density** (quarters, eighths, triplets, sixteenths). Kick, snare and
  side stick stay where the groove puts them. **Swing/shuffle** swings the ride at eighths (the off-beat comes two
  twelfths late) and shuffles at triplets (the middle triplet is silent); at quarters and sixteenths it is straight.
- **Grooves (my choice of patterns):** Rock/pop 4/4 (kick 1, 3 and the and of 3, snare 2 and 4); Ballad 4/4
  (kick 1 and a soft kick on the and of 3, side stick 2 and 4, quiet hat); Waltz 3/4 (kick 1, soft snare 2 and 3);
  6/8 as six eighth-note beats (kick 1, snare 4, hat strong on 1 and 4, an open hat on the last eighth); Swing/shuffle
  4/4 (ride, hat chick on 2 and 4, soft kick on 1 and 3); Bossa nova 4/4 (kick on 1, 2-and, 3, 4-and over a one-bar
  rim clave 1, 2-and, 4).
- **The meter rule.** Picking a groove sets beats per bar to the groove's own length (`pickGroove`: waltz 3, 6/8 six,
  the rest four). Changing the beats afterwards is allowed, and the groove then cycles by its own length
  (`beat mod groove beats`): waltz in four plays kick, snare, snare, kick; rock in three plays kick, snare, kick and
  never reaches its second snare. Switching Click to Drums keeps the beats you already had. Accent-first-beat lifts every hit on the bar's
  first beat by 25% (levels are authored at 0.8 or less so that never clips); with it off the downbeat is as loud as
  written. The speed trainer is untouched because it lives in the scheduler.
- **Settings.** `MetronomeSettings` gains `sound: 'click' | 'drums'` and `groove`, both with zod defaults (click,
  rock), so a `settings.json` written before this still parses and is not rewritten just to add them; the browser's
  stored copy falls back to the defaults for anything it does not recognise. Reconciliation across devices is as in
  ADR 0013.
- **Play-along.** `PlayAlongPrefs.drums` (default off, remembered per file) is a 🥁 Drums tick box beside 🔊 Click.
  Drums alone makes the beat sound, as drums; ticking both plays drums. The groove comes from the meter of each bar,
  not a setting: three beats is Waltz, two dotted beats is 6/8 (counted in eighths), anything else Rock/pop. Each
  click in the performance carries its groove and slot, so repeats and meter changes follow the music.
  🎶 Half-beats sets the hat density only (eighths, or thirds of a dotted beat in compound time): with drums on the
  between-beat clicks are always read, and without Half-beats they carry the groove's own hits (Rock/pop's kick on the
  "and" of 3, 6/8's open hat on the last eighth) but no hat, so both players play one groove (`music/click-hits.ts`;
  red first, 4 Nov 2026: with Half-beats off those hits were dropped). The count-in plays as a
  side stick plus a closed hat on each beat, the first louder. Known simplification: the play-along ignores a hit's
  sub-tick delay (only Rock in 9/8 and 12/8 has one), so that kick sits on the nearest earlier third.
- **Diagnostics.** `dewidebug` logs for the engine's start (sound, groove), retunes, groove picks, a sound change
  while running and, at stop, the number of drum hits, ticks that were silent by design and voices cut off; the
  player's click log gains `drums`. Per-hit logging is left out on purpose (hundreds a minute).

## Consequences

- Drum sound quality is whatever Web Audio synthesis gives; samples could replace `voices.ts` without touching the
  patterns.
- Adding a groove is one entry in `GROOVE_SPECS` plus a name in `GROOVES` (`packages/shared`), its strings and a row
  in the grooves test.
- Metronome nodes for a drum hit are tracked and cut at Stop, because a delayed hit can be seconds away at slow
  tempos.

## Update, 7 Nov 2026: hits per beat, with Auto, replace Half-beats

Dewi wanted "the drums to be able to play more per beat, so when I slow the piece down there is less silence between
each hit", and chose both a choice of his own and an automatic one. 🎶 Half-beats is replaced by **🎶 Per beat**: the
metronome's note buttons (♩ ♫ 3 ♬, now one shared component, `ui/NoteValues.tsx`) plus ✨ Auto, the default, which
picks one, two or four hits a beat so the gap at the playing speed is at most 0.6 s. It drives the click and the
drums alike. The performance now lays its clicks on a grid of twelfths of a beat (halves, thirds and quarters of a
simple beat; sixths of a dotted beat), each carrying its beat, its place in the beat and the beat's length; the
level, and so the drum slot, is worked out as each click is scheduled (`music/click-hits.ts`). Only the hats change
with the level; the groove's own hits keep their place at every level. The player now places each hit at its own
offset within the beat (at the playing speed), which lifts the earlier simplification: Rock in 9/8 and 12/8 plays its
kick where it belongs. A stored `halfBeats: true` reads as ♫ and anything else as Auto (`perBeatOf`). Play-along also
names the groove it plays (💃 Waltz) beside 🥁 Drums, because Dewi had the dock's Groove menu open and could not tell
how it related to the piece: it does not; the play-along's groove comes from the piece.

A pickup bar used to take its groove from its own length, so Gran Vals's one-beat pickup played a Rock/pop downbeat
and the new groove name said 🎸 Rock/pop until bar 2 (seen on the Pi, 7 Nov 2026). A first bar shorter than the
next is now counted as that bar's last beats: the pickup is beat 3 of the waltz, unaccented (red first).
