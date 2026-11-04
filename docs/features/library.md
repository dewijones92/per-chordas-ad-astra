---
title: Library, search, tags and setlists
status: shipped
updated: 2026-11-04
---

# Library

- Piece cards with title, artist, tags, counts of scores and tracks, and target tempo.
- **New piece** dialog: title, artist, comma-separated tags, optional PDF, optional MuseScore / MusicXML / MIDI file
  for Play-along. Picking a music file fills an empty title and artist from it. Creates and opens the piece;
  with music and no PDF it opens in Play-along. A failed upload keeps the created piece and does not upload
  a file twice on retry.
- **🎵 Start in C major or A minor** (in the dialog and beside ➕ Add music on a piece): when ticked, new music opens
  in C major, or A minor if it is in a minor key, by the nearest shift; remembered per person, off until ticked
  ([ADR 0013](../adr/0013-where-preferences-live.md)).
- **🔍 Find a score** (top of the New piece dialog): search Mutopia and Wikimedia Commons for free, public-domain
  or openly licensed scores (ADR [0026](../adr/0026-find-a-score.md)). Each result shows title, composer, instrument,
  licence (a link), its files (PDF, MIDI) and a link to the source page. Choosing one runs the 🔎 File check on its
  music file, then **⬇️ Import** makes a piece with the PDF for the score view and the music file for Play-along.
  A PDF-only result says it has no check. A site that is down or has nothing is said plainly, per site. The piece keeps
  its licence and source page (`piece.source`), shown in the piece header as attribution. If one file cannot be fetched the piece keeps the other and says what was skipped; if none can be stored
  nothing is created. Search results are remembered for ten minutes and requests are spaced a second apart.
- **Sites it cannot search**: a notice above the Find search box (always visible) says MuseScore.com ("its robots.txt
  asks automated tools to stay out of search and downloads, and it blocks them") and IMSLP ("blocks automated
  downloads") are not searched, and gives **🔎 Search MuseScore.com ↗** and **🔎 Search IMSLP ↗** buttons that open
  the site's own search, with what you typed, in a new tab. The app never fetches either site.
- **🔗 Source on every piece** (ADR [0028](../adr/0028-piece-sources-and-ratings.md)): under the title of a piece,
  **🔗 Add a source link** (or **✏️ Edit** beside an existing one) takes a pasted link (MuseScore, IMSLP, a YouTube
  tutorial, anything `http(s)`; `https://` is added if left off) and, optionally, what the page shows: ⭐ stars (0 to 5,
  one decimal), 🗳️ ratings and 👀 views (`120`, `15k`, `1.2M`). The site name comes from the host. The header shows
  🔗 From MuseScore (a link to the page, new tab), the licence if Find a score recorded one, and
  `⭐ 4.8 (120 ratings) · 15k views · noted 4 Nov 2026`; the date is when the numbers were saved and stays until they
  change. The library card shows `⭐ 4.8` beside its counts. 🗑️ Remove clears the whole source. Saving writes only the
  source (`Source for 'X': MuseScore ⭐ 4.8` in the commit). A piece has one source, not one per file.
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
- **📅 Practise today** (above Continue, on All pieces with no search or tag): up to five suggestions, each
  saying why, e.g. "📌 ‘The run’ in Gran Vals: best 55%, last tried 6 days ago". Hard bits that are furthest
  below full speed or have not been tried for longest, and pinned pieces not practised for 3+ days. A hard-bit
  line opens the piece in Play-along with that bit's loop already set; "✅ Done for today" hides a line until
  tomorrow. Per person, and hidden entirely when there is nothing to suggest. The rule is in ADR
  [0025](../adr/0025-practise-today.md).
- **Continue** row: the four most recently opened pieces, shown on All pieces with no search or tag.
- **Card badges**: when it was last practised and the total time (or "Not practised yet"), plus the
  added/edited/opened time when that is the sort.
- **🎲 Pick for me** opens a random piece from what is shown, weighted by days since it was last
  practised (capped at 60; never practised counts as 60).
- **Setlists**: ordered lists in `setlists.json`. Create, rename and delete from the sidebar; reorder
  and remove on the cards; add a piece from its page (Tags & setlists). Deleting a piece removes it
  from every setlist.

Files: `apps/web/src/library/*` (`sort.ts` is the pure sort/stats/pick module, `today.ts` the pure Practise-today ranking, `TodaySection.tsx` the list), `GET /api/today` and `DataRepo.getTodayFacts`, `rememberOpened` and
`lastOpenedAt` in `apps/web/src/resume/resume.ts`, `DataRepo.createPiece/updatePiece/deletePiece/putSetlists`.
`apps/server/src/find/*` (the sites, the polite client, the service), `apps/web/src/library/FindScore.tsx`.
`apps/web/src/piece/SourceLine.tsx`, `packages/shared/src/source.ts` (site names, link and number parsing, `applySourceEdit`).
Tests: `packages/shared/test/source.test.ts`, `apps/web/test/rating-line.test.ts`, `e2e/source.spec.ts`,
`apps/web/test/search.test.ts`, `apps/web/test/library-sort.test.ts`, `apps/web/test/practise-today.test.ts`,
`apps/server/test/data-repo.test.ts`, `e2e/library.spec.ts`, `apps/server/test/find-*.test.ts`,
`apps/web/test/find-view.test.ts`, `e2e/find.spec.ts`.
