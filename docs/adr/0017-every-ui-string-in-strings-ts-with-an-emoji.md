---
title: Every UI string lives in strings.ts and visible text starts with an emoji
status: accepted
date: 2026-10-24
updated: 2026-10-24
---

# 0017 · Every UI string in `strings.ts`, visible text starting with an emoji

## Context

Dewi, 24 Oct 2026: "we have a file of strings like in the totem app … I want to prefix every string with an
emoji so it's very visually clear in the UI what is what." Totum keeps its text in `strings.xml` and prefixes
state strings with an emoji (its ADR 43). Asked how far to go, he chose all visible text (not just states), one
typed strings file with checks, and tooltips, placeholders and screen-reader labels left plain.

## Decision

- **One file, four groups** (`apps/web/src/strings.ts`):
  - `strings`: everything you can see (buttons, labels, headings, menu items, messages, empty states,
    errors, state readouts). Each starts with an emoji. Parameterised ones are functions.
  - `tips`: tooltips (`title`), placeholders, `aria-label`s and hover details. Plain, never an emoji.
  - `units`: words that sit between numbers or inputs inside a sentence (`bpm`, `every bars`, `written in`,
    `now`, `semitones`). Plain, because an emoji on each scrap would be noise; the row's label carries one.
  - `names`: the app's name and the piano credit. Plain.
    The user's own data (titles, notes, file names, default names like "Bars 12–16") stays as it is.
- **Shared words live once** (`strings.common`: play, pause, retry, speed, loading), and labels shared between
  screens point at one string (the Tags field, Back to the library).
- **Vocabulary**: ✅ done or on, ❌ failed, ⚠️ caution, ⏳ working or waiting, 📭 empty, 🔄 retry, 🗑️ delete or
  remove, ➕ add, 💾 save or export, ✏️ edit or draw, 🔁 loop, 🎹 Play-along, 📄 PDF, 🎧 tracks, 🎼 notation,
  🎯 tempo or target, 📌 pin or hard bit, 📡 unreachable, plus a fitting one per feature. A symbol that is not an
  emoji (✦ ▯ ★ ☆ plain arrows) was replaced.
- **Checked, not reviewed** (`apps/web/test/strings.test.ts`): every `strings` leaf starts with an emoji and no
  `tips`/`units` leaf does; and, parsing every component with TypeScript's own parser, no text is typed inline in
  JSX, in a ternary or `&&` inside JSX, in `title`/`aria-label`/`placeholder`/`alt`/`label` props, or in
  `label`/`title`/`text`/`placeholder` fields of constant tables. Text built in plain `.ts` files (sort names,
  tool and stamp names, sync pill states) is moved by hand, since the check cannot see it.
- **e2e tests read labels from the same file** wherever they match words exactly.

## Consequences

- Wording changes in one place, and a test fails if new text is typed inline or loses its emoji.
- Screen readers read the visible emoji by name; Dewi does not use one, and tooltips and labels stay plain.
- A sentence split around inline elements (key badges) became one plain sentence, since each piece of a
  split sentence would need its own emoji.
