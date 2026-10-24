---
title: Library, search, tags and setlists
status: shipped
updated: 2026-10-24
---

# Library

- Piece cards with title, artist, tags, counts of scores and tracks, and target tempo.
- **New piece** dialog: title, artist, comma-separated tags, optional PDF, optional MuseScore / MusicXML file
  for Play-along. Picking a music file fills an empty title and artist from it. Creates and opens the piece;
  with music and no PDF it opens in Play-along. A failed upload keeps the created piece and does not upload
  a file twice on retry.
- **Search** (`/` focuses it): MiniSearch over title, artist, tags and notes, with prefix matching and
  small typos forgiven; title matches rank first.
- **Tag chips**: a piece must have every selected tag.
- **Sort**: Title A–Z, Artist A–Z, Recently added, Recently edited (drawings and loops count),
  Recently opened, Recently practised, Needs practice (never practised first, then the longest ago),
  Most practised and Target tempo. **Reverse** flips it; pieces missing the value (never opened, no
  artist, no target) stay last either way. The choice follows you to your other devices (resume state, ADR 0013). A setlist opens in
  its own order (the only order where ↑/↓ show). While searching, results are best match first and the
  sort is paused. ADR [0012](../adr/0012-library-sort-facts.md) says where each date comes from.
- **Pin** (☆ on a card, or ☆ Pin beside the title on a piece): pinned pieces sit at the top of every
  sort and are tinted. Saved in `piece.json`; commits say `Pin`/`Unpin`, and pinning is not an edit.
- **Continue** row: the four most recently opened pieces, shown on All pieces with no search or tag.
- **Card badges**: when it was last practised and the total time (or "Not practised yet"), plus the
  added/edited/opened time when that is the sort.
- **🎲 Pick for me** opens a random piece from what is shown, weighted by days since it was last
  practised (capped at 60; never practised counts as 60).
- **Setlists**: ordered lists in `setlists.json`. Create, rename and delete from the sidebar; reorder
  and remove on the cards; add a piece from its page (Tags & setlists). Deleting a piece removes it
  from every setlist.

Files: `apps/web/src/library/*` (`sort.ts` is the pure sort/stats/pick module), `rememberOpened` and
`lastOpenedAt` in `apps/web/src/resume/resume.ts`, `DataRepo.createPiece/updatePiece/deletePiece/putSetlists`.
Tests: `apps/web/test/search.test.ts`, `apps/web/test/library-sort.test.ts`,
`apps/server/test/data-repo.test.ts`, `e2e/library.spec.ts`.
