---
title: Architecture
updated: 2026-10-24
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

| Fact                                    | Only place                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Shape of every data file and API body   | `packages/shared/src/schemas.ts`                                                |
| Sync status shape                       | `packages/shared/src/sync.ts`                                                   |
| Slug and file-name rules                | `packages/shared/src/slug.ts`                                                   |
| Upload size caps                        | `packages/shared/src/schemas.ts` (`MAX_SCORE_BYTES`, `MAX_TRACK_BYTES`)         |
| Server configuration and defaults       | `apps/server/src/config.ts`                                                     |
| Node major version                      | `.nvmrc` (preflight checks the Dockerfile)                                      |
| Test PDFs and tones                     | `packages/fixtures`                                                             |
| Test scores (MuseScore 2/3/4, MusicXML) | `packages/fixtures/src/music.ts` (one spec, every encoding)                     |
| Score model (measures, notes, repeats)  | `apps/web/src/music/model.ts`                                                   |
| Play-along prefs, speed limits, views   | `packages/shared/src/prefs.ts`                                                  |
| Piano samples and their licence         | `apps/web/public/piano/manifest.json` (built by `tools/build-piano-samples.sh`) |
| Annotation tool sizes, colours, keys    | `apps/web/src/annotate/tools.ts`                                                |
| Design tokens                           | `apps/web/src/styles/global.css` `:root`                                        |

## Server

- `config.ts`: zod-validated environment.
- `store/git.ts`: `execFile` wrapper (no shell), SSH key and pinned known_hosts through `GIT_SSH_COMMAND`.
- `store/sync-engine.ts`: one serial queue of git operations; phases `clean → dirty → committing →
pushing → clean | push-failed`.
- `store/data-repo.ts`: domain operations with per-key locks; each mutation calls `markDirty(description)`.
- `app.ts`: `/healthz` (open), trusted-network guard, `/api/*`, SPA with immutable hashed assets.

## Web

- `api/client.ts`: fetch wrapper that parses every response with the shared schemas, and tracks saves
  for the status pill.
- `score/`: `pdf.ts` (lazy legacy pdf.js), `ScoreViewer` (layouts, page turning, text editor),
  `PageView` (lazy canvas render per page plus the annotation layer), `turn.ts` (pure),
  `pdf-marks.ts` (converts a PDF's own annotations into drawings, ADR 0011).
- `annotate/`: `AnnotationLayer` (pointer input → items), `history.ts` (pure reducer, coalesced
  groups), `geometry.ts` (hit-testing, paths), `use-annotations.ts` (load and autosave),
  `use-pdf-marks.ts` (one-time import of a PDF's marks on first open).
- `metronome/`: `scheduler.ts` (pure), `engine.ts` (Web Audio), `MetronomeProvider` (app-wide).
- `music/`: Play-along (ADR 0014). `load.ts` unzips and picks the reader; `mscx.ts` (MuseScore 2–4) and
  `musicxml.ts` fill one `ScoreModel`; `unroll.ts` decides the bar order; `performance.ts` turns it into
  notes in seconds; `transport.ts` (pure) schedules against the audio clock; `player.ts` plays the
  Salamander samples; `falling.ts` draws the notes and keyboard; `PlayAlong.tsx` and `BarStrip.tsx` are
  the panel.
- `tuner/`, `looper/`, `practice/`, `library/`, `sync/`.
