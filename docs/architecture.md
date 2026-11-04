---
title: Architecture
updated: 2026-11-04
---

# Architecture

```
browser (React SPA) ──/api──▶ nginx_dewi (Google gate) ──▶ app container (Hono)
                                                              │ DataRepo: files
                                                              │ SyncEngine: git add/commit/push
                                                              ▼
                                         /var/lib/per-chordas-ad-astra/data (clone)
                                                              │ deploy key, ssh
                                                              ▼
                                         github.com/dewijones92/per-chordas-ad-astra-data (private)
```

## Where each fact lives (DRY)

| Fact                                                         | Only place                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Shape of every data file and API body                        | `packages/shared/src/schemas.ts`                                                |
| Sync status shape                                            | `packages/shared/src/sync.ts`                                                   |
| Slug and file-name rules                                     | `packages/shared/src/slug.ts`                                                   |
| Upload size caps                                             | `packages/shared/src/schemas.ts` (`MAX_SCORE_BYTES`, `MAX_TRACK_BYTES`)         |
| Server configuration and defaults                            | `apps/server/src/config.ts`                                                     |
| Node major version                                           | `.nvmrc` (preflight checks the Dockerfile)                                      |
| Test PDFs and tones                                          | `packages/fixtures`                                                             |
| Test scores (MuseScore 2/3/4, MusicXML)                      | `packages/fixtures/src/music.ts` (one spec, every encoding)                     |
| Test MIDI files                                              | `packages/fixtures/src/midi.ts` (`makeMidi`, an independent writer of the spec) |
| Score model (measures, notes, repeats)                       | `apps/web/src/music/model.ts`                                                   |
| Play-along prefs, speed limits, views                        | `packages/shared/src/prefs.ts`                                                  |
| Where a piece came from: site names, link and number parsing | `packages/shared/src/source.ts` (ADR 0028)                                      |
| Piano samples and their licence                              | `apps/web/public/piano/manifest.json` (built by `tools/build-piano-samples.sh`) |
| Annotation tool sizes, colours, keys                         | `apps/web/src/annotate/tools.ts`                                                |
| Design tokens                                                | `apps/web/src/styles/global.css` `:root`                                        |

## Server

- `config.ts`: zod-validated environment.
- `store/git.ts`: `execFile` wrapper (no shell), SSH key and pinned known_hosts through `GIT_SSH_COMMAND`.
- `store/sync-engine.ts`: one serial queue of git operations; phases `clean → dirty → committing →
pushing → clean | push-failed`.
- `store/data-repo.ts`: domain operations with per-key locks; each mutation calls `markDirty(description)`.
- `find/`: Find a score (ADR 0026). `mutopia.ts` and `commons.ts` normalise each site's answer (pure), `polite-fetch.ts` is
  the only code that fetches (origin list, spacing, size caps), `service.ts` searches, previews and imports through
  `DataRepo`, `ttl-cache.ts` remembers answers; `create.ts` wires the origins from `FIND_*` settings.
- `app.ts`: `/healthz` (open), trusted-network guard, `/api/*`, SPA with immutable hashed assets.

## Web

- `api/client.ts`: fetch wrapper that parses every response with the shared schemas, and tracks saves
  for the status pill.
- `library/FindScore.tsx`: the 🔍 Find a score panel in the New piece dialog; `find-view.ts` holds its pure text.
- `piece/SourceLine.tsx`: the 🔗 source link, rating and its edit form in the piece header (ADR 0028).
- `score/`: `pdf.ts` (lazy legacy pdf.js), `ScoreViewer` (layouts, page turning, text editor),
  `PageView` (lazy canvas render per page plus the annotation layer), `turn.ts` (pure),
  `pdf-marks.ts` (converts a PDF's own annotations into drawings, ADR 0011).
- `annotate/`: `AnnotationLayer` (pointer input → items), `history.ts` (pure reducer, coalesced
  groups), `geometry.ts` (hit-testing, paths), `use-annotations.ts` (load and autosave),
  `use-pdf-marks.ts` (one-time import of a PDF's marks on first open).
- `metronome/`: `scheduler.ts` (pure), `engine.ts` (Web Audio), `MetronomeProvider` (app-wide).
- `drums/`: `grooves.ts` (pure patterns and the tick-to-hits function), `voices.ts` (synthesised drum sounds); used by the
  metronome and the play-along (ADR 0022).
- `music/`: Play-along (ADR 0014). `load.ts` unzips and picks the reader (`MThd` means MIDI); `mscx.ts` (MuseScore 2–4),
  `musicxml.ts` and `midi.ts` (Standard MIDI Files) fill one `ScoreModel`; `unroll.ts` decides the bar order; `performance.ts` turns it into
  notes in seconds; `transport.ts` (pure) schedules against the audio clock; `player.ts` plays the
  Salamander samples; `falling.ts` draws the notes and keyboard; `PlayAlong.tsx` and `BarStrip.tsx` are
  the panel. Wait for me (ADR 0024): `wait-for-me.ts` (pure targets and session), `key-input.ts` (the one seam),
  `midi-input.ts`, `computer-keys.ts`/`computer-key-input.ts`, `use-wait-for-me.ts`, `WaitForMePanel.tsx`;
  `transport.ts` can hold at a limit and `player.ts` takes a gate and plays live keys. Notation (ADR 0015): `to-musicxml.ts` converts MuseScore to MusicXML, `notation.worker.ts`
  runs Verovio, `Notation.tsx` shows it and colours what is playing; `keys.ts` `intervalFor` keeps
  Verovio's key the same as ours.
- `tuner/`, `looper/`, `practice/`, `library/`, `sync/`.
