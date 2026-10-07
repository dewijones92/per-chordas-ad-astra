---
title: Testing strategy and coverage map
updated: 2026-10-07
---

# Tests

**Pyramid.** Vitest unit tests on pure modules and the server (with real git against a bare repo);
Playwright e2e for every flow, against the built server, with a bare repo standing in for GitHub and a
generated 110 Hz tone as a fake microphone. CI runs all of it on every push and pull request
(`pnpm gate` runs the same locally). The coverage gate is 75% lines, functions and statements, and 70%
branches (currently about 93% of lines).

**Exempt from the unit coverage gate, covered by e2e instead** (listed in `vitest.config.ts`): React
components (`*.tsx`), the Web Audio metronome engine, the microphone hook, the annotation autosave hook,
the pdf.js loader, the sync polling hook, and the server's `main.ts`/`log.ts` wiring. These are thin
adapters over browser or process APIs; their logic lives in pure modules that are unit tested.

## Unit and integration (Vitest)

| Suite                                  | Covers                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/server/test/sync-engine.test.ts` | batching, flush, outage then retry, rebase over a remote commit, crash recovery, local mode |
| `apps/server/test/data-repo.test.ts`   | slugs, uploads and caps, patch rules, annotations, loops, setlists, log, path traversal     |
| `apps/server/test/http.test.ts`        | trusted networks, CRUD, error mapping, byte ranges, SPA caching                             |
| `apps/server/test/files.test.ts`       | git-friendly JSON, path containment                                                         |
| `apps/web/test/metronome.test.ts`      | spacing, accents, subdivisions, no drift over an hour, trainer, tap tempo                   |
| `apps/web/test/tuner.test.ts`          | note maths, cents, nearest string, median                                                   |
| `apps/web/test/looper.test.ts`         | loop normalising, wrap, peaks, time format                                                  |
| `apps/web/test/history.test.ts`        | undo/redo, coalesced drags, no-ops, limits                                                  |
| `apps/web/test/geometry.test.ts`       | hit-testing every item kind, bounds, paths                                                  |
| `apps/web/test/turn.test.ts`           | page turns from the top, tall pages, spreads, bounds                                        |
| `apps/web/test/practice.test.ts`       | timer, durations, totals, best tempo, streaks                                               |
| `apps/web/test/search.test.ts`         | fuzzy search, tags, setlist ordering                                                        |

## End to end (Playwright)

| Spec               | Flows                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `library.spec.ts`  | create piece with PDF → in the remote; search and tag filters; setlist saved                            |
| `annotate.spec.ts` | pen, stamp, text → remote → survive reload; undo/redo/eraser reach the remote; bookmark saved and jumps |
| `tools.spec.ts`    | metronome ticks and stops; tuner hears A2 within 2 cents                                                |
| `practice.spec.ts` | timed session logged with tempo; looper speed, playback, drag-loop, saved loop in the remote            |
| `health.spec.ts`   | health reports version and sync; unknown routes                                                         |

**Not covered automatically:** the real GitHub push (covered by the bare-repo stand-in and checked by
hand after deploy), the Google gate (checked by response body after deploy), and audio quality.

Run locally: `PW_CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1169/chrome-linux/chrome pnpm e2e`.
