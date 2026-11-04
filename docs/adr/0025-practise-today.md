---
title: Practise today, a short list worked out from what the app already records
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0025 · Practise today: a ranked list on the Library, from recorded facts

## Context

Dewi, 4 Nov 2026: a short list on the Library that suggests what to practise today, so he does not have to
decide. The app already records each piece's target tempo, pinned flag and practice log, and each hard bit's
best speed (per person, ADR 0019). It did **not** record when a hard bit was last tried, which spaced
repetition needs.

## Decision

- **One call, one pure function.** `GET /api/today` returns facts for the signed-in person: every piece that is
  pinned or has a hard bit, with its target tempo, last practised time and best logged BPM (from that person's
  sessions) and its hard bits with that person's best speed (`TodayFacts` in `packages/shared/src/today.ts`;
  `DataRepo.getTodayFacts`). `rankToday` in `apps/web/src/library/today.ts` turns the facts, the "last tried"
  stamps and the "done today" stamps into at most five suggestions. It is pure, takes `now`, and is tested
  with fixed dates.
- **"Last tried" is new, and lives in the resume state** (ADR 0010, per person, outside git): `bitsTried`,
  keyed `<piece>/<file>/<bit>`, stamped when a hard bit's loop is **playing** in Play-along (choosing the chip
  without playing does not count). It is not in the data repo because a try is not a change to the practice
  data, and stamping it there would commit on every play. `todayDone` holds the "✅ Done for today" marks.
- **Ranking rule.** For a hard bit, `gap = max(0, 1 − best speed)` against full speed (100%) and
  `days` = days since tried. It is suggested when `days ≥ 1` (or never recorded) and either
  `gap ≥ 0.1` (best under 90%) or `days ≥ 7`; with no try on record only the `gap` test applies, so the
  bits that existed before this feature do not all flood in as "stale". Score = `gap × 100 + min(days, 21) × 3`
  (no record counts as 7 days). A **pinned** piece is suggested when it was last practised 3 or more days ago
  (or never): score = `30 + min(days, 30) × 2`. A piece appears only when none of its hard bits is a
  candidate, so a piece is never listed beside its own bit. Highest score first, ties by piece title then bit
  name; at most two bits per piece, five in all. Target tempo does not move the score; it is shown in a pinned
  piece's reason ("best 90 of 120 BPM").
- **Each line says why**, e.g. `📌 ‘The run’ in Gran Vals: best 55%, last tried 6 days ago`, and links to
  `/piece/<id>?bit=<bit>&file=<file>`. `PiecePage` reads the two parameters once, shows Play-along on that file
  (Both, or Notes when there is no score), `PlayAlong` applies the same call as clicking the hard-bit chip,
  and the URL is then replaced with the plain piece address, the chosen view saved.
- **Done for today** hides one item until the next local day. If nothing is worth suggesting, the section is not
  drawn at all.

## Consequences

- A hard bit's first suggestion after deploying is based on its best speed alone, because nothing has stamped it yet.
- Another person's tries are not seen: stamps are per person with the resume state, as are best speeds.
- If the Pi's resume state is lost, the suggestions fall back to best speed only until bits are played again.
- The weights are plain constants in `today.ts`; changing the rule means changing them and the tests together.
