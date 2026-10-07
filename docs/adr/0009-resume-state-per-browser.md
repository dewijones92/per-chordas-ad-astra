---
title: Keep "where you left off" in the browser, not in the data repo
status: superseded by 0010
date: 2026-10-07
updated: 2026-10-07
---

# 0009 · Resume state lives in the browser

> **Superseded by [0010](0010-resume-state-on-the-server.md)** the same day: Dewi wants resume across devices.

## Context

Dewi asked to always resume where he left off. Position changes on every scroll, every looper second and
every timer tick.

## Decision

Keep it in `localStorage` (`pcaa.resume.v1`), read defensively (corrupt or blocked storage means "start
fresh"). The only resume targets allowed are the app's own routes. The timer resumes paused.

## Alternatives

Writing positions to the data repo would follow him across devices, at the cost of a stream of tiny
commits and noisy history. Not chosen until he asks for cross-device resume. The question is open with him.

## Consequences

A different browser or a cleared profile starts from the library. Nothing about resume reaches GitHub.
