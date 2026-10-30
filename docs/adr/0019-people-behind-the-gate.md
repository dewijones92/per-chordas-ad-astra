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
  (a non-owner's line records `who`; lists show only your own, and unstamped lines are the owner's); and hard-bit
  best speeds (the owner's stays in `bestSpeed`, others' in `best.<person>`, and the API hands each person their
  own as `bestSpeed`).
- **What stays shared:** pieces, scores, music, drawings, hard bits themselves, loops, setlists, metronome
  settings.

## Consequences

- **Batch review fixes (30 Oct 2026).** The owner's sessions are never stamped (no `who` = the owner), so unsetting
  or renaming `OWNER_PERSON` cannot hide them, and with it unset every line counts. A best speed is raised through
  its own call (`PUT …/hard-bits/<file>/<bit>/best`, kept only if faster), so a stale tab's whole-list save can no
  longer drop a bit someone else added; a whole-list save keeps each existing bit's stored bests. Removing a music
  file rewrites the other files' hard bits from the raw file, keeping everyone's bests. Every API reply carries
  `X-Person`; the browser drops its cached resume state when the person changes, and says whose cache it pushes
  (`X-Resume-Person`), which the server refuses with 409 if it is someone else's. A request with no email while
  `OWNER_PERSON` is set logs a warning once (a missing nginx header would make everyone the owner).
- Adding someone needs two Pi changes outside this repo: their email on the gate's allowlist, and the nginx
  header (once). On this Pi the gate is one allowlist for every gated site, so a person who should reach only this
  app needs the other sites limited too (dot-files ADR).
