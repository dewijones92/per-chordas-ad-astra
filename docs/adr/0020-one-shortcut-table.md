---
title: One shortcut table; Space plays whatever is on screen
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0020 · One shortcut table; Space plays whatever is on screen

## Context

Dewi, 4 Nov 2026: "make sure that spacebar always plays and pauses", and that the keys are sensible in general.
Space did nothing after clicking a tick box or the speed slider (the key handlers treated every `<input>` as typing,
so the browser ticked the box instead), and in the Both view it ran the metronome rather than the play-along.

## Decision

- **One table** (`apps/web/src/ui/shortcuts.ts`) maps keys to actions. Every handler asks `shortcutOf(event)`, and
  the ⌨️ Keys list in the top bar is built from the same strings, so a binding and its help cannot drift apart.
- **A focused control keeps only the keys it uses.** Text boxes, number boxes and text areas keep every key; a
  slider keeps its arrows and Page keys; a select keeps everything but Space; a tick box, radio or button keeps
  nothing, so Space still plays after clicking one. Ctrl, Cmd and Alt combinations stay with the browser.
- **Space and K play and pause the play-along whenever it is on screen** (Notes and Both views). The play-along
  listens on `document` and claims the key; the metronome's Space handler listens on `window`, runs later in the
  same bubble, and only acts when nothing claimed it. So Space runs the metronome on a PDF-only view and on the
  Metronome & tuner page, and nowhere else (it still scrolls the library).
- **M starts and stops the metronome on every page.**

## Consequences

- An e2e test covers each case: Space with a tick box, the slider, the Play button and the canvas focused; Both
  view; M; a PDF-only view; the Metronome page; a number box still typing.
- New bindings go in the table and the ⌨️ Keys strings, never as a new `e.key ===` check in a component.
- The one exception is the computer keyboard as a piano while 🎹 Wait for me is on (`computer-keys.ts`, ADR 0024):
  its letters are a note map, not commands, and a unit test checks that none of them is in this table. K and M are
  left out of it so Space, K and M keep their jobs.
