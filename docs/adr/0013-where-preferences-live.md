---
title: Metronome settings in the data repo; view preferences in the resume state
status: accepted
date: 2026-10-14
updated: 2026-10-14
---

# 0013 · Where preferences live

## Context

Metronome settings, the score layout (Page / Two / Width) and the library sort were kept per browser in
`localStorage`, and zoom was not kept at all, so none of them followed Dewi between devices. He asked
why not save everything to GitHub (14 Oct 2026). Putting fast-changing view state in git would mean a
commit for every zoom step and noise in the data repo's history, which the spec says must stay readable
(ADR 0010 made the same call for scroll positions).

## Decision

- **Metronome settings go in the data repo** as `settings.json` (`{ metronome, updatedAt }`). They are
  part of how Dewi practises and change rarely. `GET /api/settings`, `PUT /api/settings/metronome` with
  `{ settings, at }`. The browser keeps a stamped copy, pushes 1.5 s after the last change (and with
  keepalive when the page hides), and on start reconciles: the newer stamp wins. A save older than the
  stored one is ignored, a save that changes nothing is not written, and the commit message lists what
  changed (`Metronome: bpm 80 → 92`).
- **Zoom per score, the page layout and the library sort go in the resume state** on the Pi (ADR 0010),
  newest-wins per entry, so they follow you between devices without commits.
- The old per-browser values are still read once when nothing newer exists (`pcaa.metronome.v1`,
  `pcaa.score.view.v1`, `pcaa.library.sort.v1`), so the first device to load after the change carries
  its preferences over.
- Search text, tag chips and the selected setlist stay unsaved: a fresh start is expected there.

## Consequences

- A tempo change on the laptop shows on the desktop the next time it loads the app (not live).
- Two devices changing the metronome at once: the later change wins as a whole, not field by field.
- Shapes for all of these live in `packages/shared/src/prefs.ts`.
