---
title: More than one person, told apart by the gate's email
status: accepted
date: 2026-10-30
updated: 2026-10-30
---

# 0019 · People: the gate says who you are; place, settings, log and bests are your own

## Context

Dewi, 30 Oct 2026: his wife should be able to sign in with her own Gmail and see the same pieces, but things
like the last piece played should be her own. Asked which things, he chose: **where I left off**, **play-along
settings** and **the practice log and best speeds**; drawings stay shared.

## Decision

- **Identity comes from the gate.** oauth2-proxy already puts the signed-in email in `X-Auth-Request-Email`;
  nginx passes it to the app as `X-Forwarded-Email`, always overwriting anything a browser sent, and the app
  still only accepts requests from the nginx network (ADR 0006). The app turns the email into a **person key**,
  the part before the @ made file-safe (`dewi.jones92`), so no email address is written to git.
- **`OWNER_PERSON` switches it on.** With it unset (dev, older deploys) the app is single-user exactly as before.
  With it set, a request with no email, or the owner's, is the owner; everything that existed before belongs to
  the owner, so Dewi keeps his history and his wife starts clean.
- **What is per person:** the resume state (`.state/resume.json` for the owner, `.state/resume-<person>.json`
  for others), which holds the last place, each file's play-along settings, zoom and layout; practice sessions
  (each line records `who`, and lists show only your own, with old lines counted as the owner's); and hard-bit
  best speeds (the owner's stays in `bestSpeed`, others' in `best.<person>`, and the API hands each person their
  own as `bestSpeed`, so the web app did not change).
- **What stays shared:** pieces, scores, music, drawings, hard bits themselves, loops, setlists, metronome
  settings.

## Consequences

- Two people practising on one browser profile would still share that browser's cached play-along settings
  until the server's newer copy arrives; separate devices or profiles keep them apart.
- Adding someone needs two Pi changes outside this repo: their email on the gate's allowlist, and the nginx
  header (once).
