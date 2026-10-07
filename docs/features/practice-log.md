---
title: Practice timer and log
status: shipped
updated: 2026-10-07
---

# Practice timer and log

- On a piece: **Practise** / Pause / **Done**, then log the top clean tempo (pre-filled from the
  metronome) and a note. One JSON line per session in `log/YYYY/MM.jsonl`.
- Per piece: session count, total time, a target tempo, and a **BPM-over-time chart** (best tempo per
  day against the target line).
- The **Practice log** page shows the day streak (today counts once you practise), minutes this week
  (weeks start Monday), sessions logged, a four-week bar chart, and recent sessions.

Files: `apps/web/src/practice/*`, `DataRepo.addSession/listSessions`.
Tests: `test/practice.test.ts`, `e2e/practice.spec.ts`.
