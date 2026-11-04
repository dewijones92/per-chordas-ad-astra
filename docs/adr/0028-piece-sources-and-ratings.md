---
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0028 · Every piece can say where it came from: an editable link, and a rating typed once

## Context

Dewi, 4 Nov 2026. `piece.source` (ADR 0026) was only ever filled by 🔍 Find a score and could not be changed, so a piece
learned from a MuseScore page, an IMSLP scan or a YouTube tutorial had nowhere to say so. MuseScore.com cannot be read
by the app: its `robots.txt` disallows `/search/`, `/sheetmusic?` and `/score/*/download/*`, and it answers automated
fetches with 403 Forbidden. We do not fetch or scrape it, and we do not work around its bot protection. What MuseScore
shows on a score's page (the stars, how many people rated it, the views) is useful when choosing what to learn, so Dewi
types it in once, by hand.

## Decision

- **The source belongs to the piece, not to each file.** One optional `piece.source` (decided by Sonnet 5.5 while
  building this; Dewi's brief left the choice open). Reasons: a piece is the thing Dewi learns, and "where did I get
  this and how good was it" is a fact about the piece; Find a score already writes it there; the header, the library
  card and the commit message all read one object; and a per-file source would put a second place to look on every
  score tab and music file, plus a second edit control, for a case that does not yet need it. **What this gives up:**
  a piece whose PDF came from one site and whose MuseScore file came from another (Gran Vals) records only one of the
  two links. If that matters, the extension is an optional `source` on `ScoreRef` and `MusicRef`, with the piece's
  source as the fallback; the schema here would not need to change, only grow.
- **The shape.** `source` is `{ name, url, licence, licenceUrl, rating }`.
  - `url` and `licenceUrl` must be `http` or `https` (zod `z.url({ protocol })`, in the schema, so the server answers
    400 for `javascript:` or `ftp:` and the link is safe to put in an `href`). The browser, which is friendlier, adds
    `https://` to a pasted `musescore.com/…` and refuses everything else with a plain message
    (`parseSourceUrl`).
  - `licence` and `licenceUrl` are now `nullable` with a default of `null`, because a pasted link has no licence.
    Pieces written by Find a score before this change still read as they were; `rating` defaults to `null`.
    No migration of files is needed; the next save writes the new shape.
  - `rating` is `{ stars, ratings, views, notedOn }`. Each of `stars` (0 to 5 in tenths), `ratings` and `views` may be
    `null`, but at least one must be a number. `notedOn` is the day (`YYYY-MM-DD`, UTC) the numbers were saved.
    Favourites and downloads were left out: three numbers are what the page leads with and keep the form small.
- **The server derives, the browser does not decide.** The patch carries `source: { url, rating } | null` only
  (`PiecePatch`, `SourceEdit`). The site name comes from the host in one place, `siteNameFor` in `packages/shared`:
  musescore.com is "MuseScore", mutopiaproject.org "Mutopia Project", imslp.org "IMSLP", wikimedia.org "Wikimedia
  Commons", anything else its host without `www.`. The date is stamped by the server and kept while the numbers are
  unchanged, so re-saving the form does not make an old rating look fresh. `applySourceEdit` (pure, unit-tested) holds
  the rules: while the link is unchanged the name and any licence recorded by Find a score are kept; a changed link
  drops the licence, since it belonged to the old page; `null` removes the source.
- **Only the source field is written.** The patch is strict, so a source edit cannot carry a title, notes or score list
  from stale client state (the "never send a whole document" gotcha). `updatePiece` merges it onto the stored piece and
  the commit says what happened: `Source for 'The Lonely Waltz': MuseScore ⭐ 4.8`, or `Remove the source of …`.
- **Where it shows.** Under the title in the piece header: 🔗 From MuseScore (a link, new tab, `rel="noreferrer"`),
  the licence when there is one, `⭐ 4.8 (120 ratings) · 15k views · noted 4 Nov 2026`, and ✏️ Edit. A piece with no
  source shows 🔗 Add a source link. The library card gains a `⭐ 4.8` beside its counts when the rating has stars
  (one more chip in the existing row, with the site named in its tooltip).
- **The Find panel says what it cannot search, in plain sight.** A notice above the search box (not behind a help
  button) names MuseScore.com and IMSLP, says why in one line each, and offers 🔎 Search MuseScore.com ↗ and 🔎 Search
  IMSLP ↗ that open the site's own search in a new tab with the query typed so far
  (`https://musescore.com/sheetmusic?text=…`, `https://imslp.org/index.php?search=…`; built by `selfSearchUrl`, never
  fetched). It also says what to do next: add the downloaded file as a New piece, then paste the link under 🔗 Source and
  type the stars. The MuseScore search address was reasoned from the site's own public search URLs, not fetched, so if
  MuseScore changes it the button lands on their search page without the query rather than breaking.

## Consequences

- Nothing here talks to MuseScore or IMSLP. The app only links to them.
- The rating is a note Dewi typed on a date, not live data; the date is shown with it so it reads as such.
- A piece has one source. Two origins for one piece is the known gap above.
- Old `piece.json` files with a Find source keep working, and a rating or link added to one keeps its licence.
