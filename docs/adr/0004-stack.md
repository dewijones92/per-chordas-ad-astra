---
title: pnpm workspace, strict TypeScript, React + Vite front end, Hono API, one container
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0004 · Stack

## Decision

- **pnpm 11 workspace**: `packages/shared` (zod schemas), `packages/fixtures`, `apps/server`, `apps/web`.
- **TypeScript 6.0.x**, strictest settings, typescript-eslint `strictTypeChecked`. TS 7 is the native
  rewrite and typescript-eslint does not support it yet.
- **Web**: React 19, Vite 8, wouter, pdf.js, perfect-freehand, pitchy, MiniSearch. No state library.
- **Server**: Hono on Node 24, bundled by esbuild into one file, so the runtime image has no
  `node_modules`.
- **Tests**: Vitest (node + jsdom projects) and Playwright.

## Why

Dewi picked React + Vite + Node from three options. One container serves the SPA and the API, so there
is one thing to deploy, and the server holds the git credentials so the browser never does.
