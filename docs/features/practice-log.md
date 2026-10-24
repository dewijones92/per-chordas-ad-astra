---
title: Practice timer and log
status: shipped
updated: 2026-10-24
---

# Practice timer and log

- On a piece: **Practise** / Pause / **Done**, then log the top clean tempo (pre-filled from the
  metronome) and a note. One JSON line per session in `log/YYYY/MM.jsonl`.
- Per piece: session count, total time, a target tempo, and a **BPM-over-time chart** (best tempo per
  day against the target line).
- **Play-along logs itself** (Dewi, 24 Oct 2026): after at least a minute of playing along, a session is
  logged when you leave the piece or stay paused for two minutes. Only time actually playing counts. The
  note names the file, the bars looped and the top speed ("Play-along: Gran Vals, looped bars 12–16, up to
  75% speed"), and the tempo is the file's tempo × that speed, so the chart shows the hard bits getting
  faster. Delete it from the log like any other session.
- The **Practice log** page shows the day streak (today counts once you practise), minutes this week
  (weeks start Monday), sessions logged, a four-week bar chart, and recent sessions. It refreshes when a save
  finishes, so a session logged as you left a piece appears without reloading.

Files: `apps/web/src/practice/*`, `DataRepo.addSession/listSessions`.
Tests: `test/practice.test.ts`, `e2e/practice.spec.ts`.
