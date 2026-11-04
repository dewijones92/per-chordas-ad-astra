---
title: Wait for me: the falling notes stop at your notes until you play them, from MIDI, the screen or the computer keyboard
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0024 · Wait for me: the falling notes stop at your notes until you play them

## Context

Dewi (piano learner), 4 Nov 2026: in Play-along, a **🎹 Wait for me** mode where the falling notes stop at each
note or chord until he plays the right key or keys, then carry on, with a short result at the end (notes right
first time, wrong notes, time spent waiting). He does not want to plug a keyboard in to test it, so the mode has to
be driveable from a virtual piano.

## Decision

- **One seam for playing, three sources.** `key-input.ts` defines `KeyEvent` (`down` or `up`, a sounding pitch, a
  velocity, where it came from) and `KeyInput` (`start(handler)`, `stop()`). The sources are Web MIDI
  (`midi-input.ts`), the on-screen keys (`ScreenKeyInput`, fed by the falling-notes canvas) and the computer keyboard
  (`computer-key-input.ts`). `use-wait-for-me.ts` starts all three while the mode is on and handles their events in
  one place; nothing downstream knows which source a key came from. A key held by two sources counts once.
- **Web MIDI listens to every connected input**, follows hot-plug through `statechange`, and names the devices in
  the bar. It is asked for only when Wait for me is switched on. No MIDI in the browser, or permission refused, is
  said plainly in the bar and the other two sources keep working. A keyboard unplugged with keys down lets them go,
  so none stays stuck. Tests replace `navigator.requestMIDIAccess` with a fake whose ports only deliver while a
  listener is set, as a real port does, and which can refuse or be missing.
- **The decision is a pure module** (`wait-for-me.ts`, no audio, no DOM). `waitTargets` groups the notes you play
  by onset (the same grouping the hand split uses) into targets of sounding pitches (written pitch plus the
  transpose). `WaitSession` holds the cursor, the keys pressed, the stats and the wait time. A chord is done when
  every pitch has been pressed within 300 ms of the others or is still held down, in any order. A wrong key is
  counted and changes nothing else. A key pressed up to 0.3 s before the music arrives still counts, so a good
  player never stops. Keys when nothing is near are ignored, not counted wrong. A note is "right first time" if no
  wrong key was pressed while its target was being asked for.
- **Which notes are yours** (`playerLanes`; my reading of the existing controls, not a new setting): the lanes you
  can see, except that if any visible lane is muted (🔊, shown but silent, the way you practise one hand) only the
  muted ones are yours. Hidden lanes (👁, still heard) and notes ✂️ thinned out of a split are never waited for.
  The app plays only what is not yours, so with nothing muted it plays only a hidden hand. Your own notes are never
  scheduled by the app; the keys you press sound through the same sampled piano.
- **The transport holds exactly at the note.** `Transport` gained `limit` (a function returning the next song
  time to stop at: `pump` schedules nothing from it on, without losing a note on resume), `onWrap` (so a loop wrap
  re-aims the limit before the next pass is scheduled), `running` and `pause(ctx, song)`. `PianoPlayer.setGate`
  takes a `PlayGate` (`limit`, `wrapped`, `held`, `ended`): when the audio clock reaches the limit it pauses at
  the limit itself, not where the 25 ms timer happened to land, lets notes already sounding ring, and calls
  `held`; `release()` resumes from exactly there. The UI keeps showing "playing" while held, so Space or the Play
  button pause it like any other moment, and seeking, a loop change or switching the mode off release the hold.
  The count-in plays before the first hold; speed and loops work as ever.
- **Seeing it.** The keys to press are outlined in coral with a pale coral fill; keys you are pressing are sun
  yellow with a dark dot, whatever their source; the lane colour for the notes the app plays is unchanged. The
  canvas, the 🎯 line and the result carry `data-*` attributes for tests.
- **Result.** A running line (`2/2 first time · 1 wrong · 1 s waited`) is always in the bar. When the music
  ends, or you pause, a card over the falling notes shows 🏁 Finished or ⏸️ So far with the three numbers and
  🔄 Start again. A run that has finished starts afresh on the next Play.
- **Computer keyboard as a piano** (my layout): `A W S E D F T G Y H U J` are C to B, white keys on the home row
  and black keys above, one octave from middle C. `Z` and `X` move it an octave down or up (shown in the bar). `K`
  is left out on purpose, so **Space and K stay play and pause**, and **M stays the metronome**. The keys are read
  by `code`, so the layout is the same on any keyboard language. While Wait for me is on, these keys are claimed
  before any other handler (`preventDefault` and `stopPropagation` on `document`), which means the drawing-tool
  letters (A, S, E, T) do not fire on the PDF in the Both view; the toolbar still works. **Except while ✏️ Draw mode
  is on** (on the stave or the falling notes): then the piano yields every key (`ComputerKeyInput`'s `yields`, fed
  by `drawingClaimed()`), so V P H E T L A R O S pick tools as the ⌨️ Keys help says, and plays again when Draw is
  done (red first, 4 Nov 2026: H, E, T, A and S played notes in Draw mode). They are not claimed in a
  text or number box.
- **In the Both view the keys follow the last click** (Dewi, 4 Nov 2026; this replaces "the drawing-tool letters do
  not fire on the PDF" above). The PDF has no Draw mode and should not need one, since it always draws. A pointer
  down anywhere in the score area claims the keys for the score (`claimDrawing('score')`), so the piano yields and
  V P H E T L A R O S pick the PDF's tools. A pointer down in the play-along (`releaseScore`, or a re-claim of the
  stave or falling notes in Draw mode), the start of playback, and the play-along opening or closing give them back.
  The wait bar names the owner in place of the computer-keys line (`data-keys`: `piano`, `score`, `notation` or
  `falling`), because a letter that silently stops playing looks broken. A new ✏️ Draw button on the PDF was the
  alternative; it was turned down as one more button for a surface that is always drawable. Red first: H played
  A4 after a click on the PDF. A key held while the octave changes is released at the pitch it started.
- **Preference.** `waitForMe` is part of the per-file Play-along preferences (default off), so it is remembered.

## Consequences

- ADR 0020's single shortcut table stays the home of every command key; the piano letters live in
  `computer-keys.ts` with a unit test that none of them is in that table. The ⌨️ Keys list has a line for them.
- Practice time counts waiting as playing time (the play-along is "playing" while held).
- Web Audio will not start from a MIDI message alone in a browser that has had no click; the first on-screen click,
  key press or Play starts it.
- The accompaniment notes sounding when a hold begins are not cut; they ring out.
