---
title: Metronome
status: shipped
updated: 2026-10-14
---

# Metronome

- 20–400 bpm, 1–12 beats, subdivisions (♩ ♫ triplets ♬), accent on beat 1, tap tempo (averages the last
  4 intervals, resets after 2 s).
- **Speed trainer**: +N bpm every M bars up to a ceiling, applied from the bar it changes on.
- Scheduling: a pure `TickScheduler` computes each tick as `anchor + n × interval` (no accumulated
  drift; an hour at 97 bpm triplets is checked to 9 decimal places). The engine schedules 120 ms ahead
  every 25 ms on the Web Audio clock.
- It lives app-wide, so it keeps going while you move between pages; the header shows a mini stop
  button. `Space` toggles it on a score page; `+`/`−` nudge the tempo. Settings are saved to GitHub as `settings.json`
  and follow you to every device; the newest change wins and each commit says what changed
  ([ADR 0013](../adr/0013-where-preferences-live.md)).

Files: `apps/web/src/metronome/*`. Tests: `test/metronome.test.ts`, `test/settings-store.test.ts`, the metronome settings tests in
`apps/server/test/data-repo.test.ts`, `e2e/tools.spec.ts`, `e2e/devices.spec.ts`.
