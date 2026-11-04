---
title: Two see-through hands drawn over the keyboard, from the fingering the notes already show
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0029 · Hands over the keyboard

## Context

Dewi, 4 Nov 2026: the bird's-eye keyboard is great, but it looks like an invisible hand is playing it. He wants to
see a hand playing, so he can see how it moves, shifts, stretches and passes the thumb under. His choices: simple
flat hands seen from above, drawn over the on-screen keyboard at the bottom of the falling-notes canvas, clean and
slightly see-through, in the hand colours, fingertips numbered 1 to 5, a finger that dips and lights up when it
presses, and hands that glide between positions. They must never hide the falling notes.

## Decision

- **The fingers are the ones already on the notes.** `hand-timelines.ts` asks `fingerOf` (yours in red, then the
  file's piano fingering, then the 🤖 suggestion) for every note and which hand plays it comes from the same lanes
  as the suggestion (`sideOfNote`); thinned octaves and hidden lanes are left out, as they are on the falling notes.
  The model never has a second opinion about a finger. When 🤖 Suggested fingering is switched off, the suggestions
  are still worked out for the hands, only the grey numbers on the notes are not drawn.
- **A pure pose module, `music/hand-pose.ts`.** Per hand it builds a timeline once per performance (events are the
  onsets, 30 ms apart or less counting as one) and `poseAt(timeline, t, pose)` fills five fingertip positions, five
  dips (0 to 1) and an opacity, with no allocation per frame. Positions are in white-key units
  (`whiteUnits(range)` from the keyboard layout), so the same timeline serves any canvas width.
  - At each onset the hand has a configuration. Pressed fingers, and fingers still holding an earlier note, sit
    over their keys; the others are placed between the pressed ones in proportion, or one white key apart
    beyond them, in finger order (right hand: finger 1 lowest; left hand mirrored). A stretch spreads the fingers
    and never crosses them.
  - Between two onsets each finger glides from its old place to its new one over at most 0.45 s (70 % of the gap)
    before the next onset, so a shift or a jump is seen ahead. A finger starts only once its note has ended, but at
    least 0.1 s before the next onset (so a finger on a held note does not snap). Fingers that were free move early and
    the held one late: that is the thumb passing under finger 3, with no special case for it.
  - A finger drops 0.05 s before its onset (so it is down at the onset) and rises 0.08 s after its note ends; a note
    shorter than 0.12 s is shown down for 0.12 s so a staccato note is still seen.
  - A hand with nothing to play for a second fades to 30 % and is back at full strength 0.5 s before its next note;
    before its first note and after its last it waits at the first or last place.
- **Drawing is `music/hand-draw.ts`, called at the end of `drawFalling`, in the same frame pass.** One path per hand
  (a palm and five finger capsules, filled at 26 % and outlined, so overlaps do not darken and the thumb under a
  finger reads like an X-ray), then a numbered tip circle per finger: white at rest with the number in the hand's
  dark colour, filled in the hand colour with a white number and a ring when pressing, 0.8 of a tip radius lower. Tips
  are 0.42 white keys wide, between 5 and 15 px; below 7 px the numbers are left off. Nothing is drawn above the
  top of the keyboard, so the notes, which land on the fingertips, are never covered.
- **A tick box, 🖐️ Show hands, on to start with** (Dewi asked for it; `hands` in `PlayAlongPrefs`, a zod default so
  older preferences parse), remembered per file with the other play-along settings, only offered when the piece is
  played on piano (the 🙋 I play on choice, or automatic).
- **Tests read the model, not pixels:** `data-hands` on the canvas, while paused, lists each hand's five tips as
  finger, x and down, next to `data-blocks`, so an e2e can check that finger 1 is down over the key of the F.

## Consequences

- The hands are only as right as the fingering: where the suggestion is poor the hand shows it. A change to the
  fingering rules changes the hands with no extra work.
- A very wide chord (more than five notes for one hand) leaves its extra notes unhanded; the hand model takes the
  fingers it is given.
- The hand shapes are deliberately simple; a better-looking hand is a change to `hand-draw.ts` only.
