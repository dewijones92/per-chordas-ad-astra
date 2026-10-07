---
title: Library, search, tags and setlists
status: shipped
updated: 2026-10-07
---

# Library

- Piece cards with title, artist, tags, counts of scores and tracks, and target tempo.
- **New piece** dialog: title, artist, comma-separated tags, optional PDF. Creates and opens the piece.
- **Search** (`/` focuses it): MiniSearch over title, artist, tags and notes, with prefix matching and
  small typos forgiven; title matches rank first.
- **Tag chips**: a piece must have every selected tag.
- **Setlists**: ordered lists in `setlists.json`. Create, rename and delete from the sidebar; reorder
  and remove on the cards; add a piece from its page (Tags & setlists). Deleting a piece removes it
  from every setlist.

Files: `apps/web/src/library/*`, `DataRepo.createPiece/updatePiece/deletePiece/putSetlists`.
Tests: `test/search.test.ts`, `apps/server/test/data-repo.test.ts`, `e2e/library.spec.ts`.
