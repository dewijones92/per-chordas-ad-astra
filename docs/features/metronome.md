---
title: Metronome
status: shipped
updated: 2026-10-07
---

# Metronome

- 20–400 bpm, 1–12 beats, subdivisions (♩ ♫ triplets ♬), accent on beat 1, tap tempo (averages the last
  4 intervals, resets after 2 s).
- **Speed trainer**: +N bpm every M bars up to a ceiling, applied from the bar it changes on.
- Scheduling: a pure `TickScheduler` computes each tick as `anchor + n × interval` (no accumulated
  drift; an hour at 97 bpm triplets is checked to 9 decimal places). The engine schedules 120 ms ahead
  every 25 ms on the Web Audio clock.
- It lives app-wide, so it keeps going while you move between pages; the header shows a mini stop
  button. `Space` toggles it on a score page; `+`/`−` nudge the tempo. Settings are remembered per browser.

Files: `apps/web/src/metronome/*`. Tests: `test/metronome.test.ts`, `e2e/tools.spec.ts`.
