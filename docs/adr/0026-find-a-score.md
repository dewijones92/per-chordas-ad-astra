---
status: accepted
date: 2026-11-04
updated: 2026-11-04
---

# 0026 · Find a score: search free sources from the New piece dialog, check the file, import it with its licence

## Context

Dewi, 4 Nov 2026, learning piano and preferring C major or A minor, spent a long time finding a usable, legal file
for Chopin's Nocturne Op. 9 No. 1 and importing it. He approved searching free, public-domain and openly licensed
sources from inside the app, seeing what each result is, running the 🔎 File check (ADR 0021) on it, and importing
it in one click. Never anything paid, never around a paywall or a login, and a polite client: few requests, a clear
name, caching, no bursts.

## Decision

- **Two sources, chosen after reading real responses on 4 Nov 2026.**
  - **Mutopia Project** (`mutopiaproject.org`). Hand-typeset public-domain and Creative Commons scores, offered as
    PDF (A4 and Letter), MIDI and LilyPond. It has no API, so the app reads the public search listing page
    (`/cgibin/make-table.cgi?searchingfor=…`, ten results a page, only the first page is read). Terms relied on: its
    `robots.txt` is `User-agent: * Disallow:` (everything allowed), and its licence page says "All music on Mutopia may
    be freely downloaded, printed, copied, distributed, modified, performed and recorded", under CC BY-SA, CC BY or
    public domain. **The listing is HTML, so a markup change on their side breaks the reader**; the parser returns
    "nothing" rather than guessing, and the failure shows as "Mutopia Project could not be searched".
  - **Wikimedia Commons** (`commons.wikimedia.org/w/api.php`). The documented MediaWiki API, with the licence in
    `extmetadata.LicenseShortName`. It supplies PDFs (many are public-domain scans of IMSLP editions, so Op. 9 is
    there); only PDFs under the 50 MB score cap and whose licence reads as open (public domain, CC0, CC BY, CC BY-SA)
    are listed, and the rest are counted as "hidden" so nothing is silently dropped. Commons MIDI files were left out:
    the ones found were fragments (a few bars to illustrate a point), not pieces. The request carries a descriptive
    User-Agent with the project address, which Wikimedia's policy asks for.
- **Rejected.**
  - **IMSLP** has the most scores, but it is not usable by an app. Its `robots.txt` disallows `/images/` (where the
    files live) for everyone and sets `Crawl-delay: 2`; a scripted request for a file path was answered with a 302 to
    `/friendlytest.html` (a human check) on 4 Nov 2026; downloads sit behind a click-through. I could not find or fetch
    published API terms (the Terms of Use address I tried returned 404), so I treated it as not permitted. Its PDFs
    that reach Commons through the Internet Archive are covered above.
  - **MuseScore.com / OpenScore** need a login to download, and `musescore.com/openscore` refused an automated fetch
    (403). The OpenScore Lieder corpus on GitHub is CC0 and downloadable without a login, but it is voice-and-piano
    songs, not piano pieces, and has no search to call (an index file would have to be read and kept). Left for later.
  - **MusicXML sample sets** (W3C, MusicXML.com) are test files, not repertoire.
- **A polite client, in one place** (`apps/server/src/find/polite-fetch.ts`): a User-Agent naming the app and its
  repository; at most one request in flight per site with a minimum gap of one second (`FIND_MIN_GAP_MS`); a timeout
  (`FIND_TIMEOUT_MS`); a search answered from memory for ten minutes and a previewed music file for ten minutes, so
  searching again or importing a file already checked asks the site for nothing; one request per site per search.
- **Only the configured sites can be fetched.** Every address, including each redirect hop, must be on the origin
  list built from `FIND_MUTOPIA_BASE`, `FIND_COMMONS_API` and `FIND_COMMONS_FILE_ORIGIN`. The import endpoint receives
  a result from the browser, so this list (not the browser's word) is what stops it fetching from anywhere else.
  Downloads are size-capped while streaming (not just by the declared length), checked by their first bytes with the
  same checks as an upload (`%PDF-`, MIDI header, zip, XML), and never trusted by content type.
- **Import uses the library's own storage path.** `FindService.importScore` downloads first, then calls
  `DataRepo.createPiece`, `addScore` and `addMusic`; there is no second way to write a file. One PDF (A4 first) for
  the score view and the richest music file (MusicXML, MuseScore, then MIDI) for Play-along. If one file fails the
  piece keeps the other and the dialog says what was skipped; if none can be stored the new piece is removed again.
- **The licence stays with the piece.** `piece.json` gains an optional `source` (`name`, page `url`, `licence`,
  `licenceUrl`), set when a piece is imported, kept through edits (it can now be changed by a source edit alone, see
  [ADR 0028](0028-piece-sources-and-ratings.md)), and shown in the piece
  header as "From Mutopia Project · Shared under Creative Commons Attribution-ShareAlike 2.5", each a link. This is the
  attribution CC BY and CC BY-SA require. It is a field, not a line of notes, so editing notes cannot lose it. The
  licence text comes from the result the browser sends back; the app is single-user behind the gate, so a forged
  licence would only mislead its own user.
- **The File check runs before the import**, on the bytes the server fetched (`GET /api/find/file`, music files only),
  with the same `readScore` and `checkFile` as a file on a piece. A PDF-only result says it has no check and no
  Play-along instead of staying silent.
- **Tests never touch the network.** Unit and server tests use saved, trimmed real responses
  (`packages/fixtures/src/find-data.ts`: three Mutopia result blocks and four Commons pages, metadata only) and a stub
  `fetch`; the e2e starts a stand-in site (`e2e/support/find-stub.ts`) and points the three origin variables at it.

## Consequences

- A search is one request to each site, and an import is one or two files. Nothing is fetched until Dewi acts.
- Mutopia's parser is the fragile part. The first sign of breakage is a source that is `ok` but finds 0 results where
  there used to be some; the server log line `dewidebug find search answered` carries each site's counts.
- Commons results are individual files, not pieces, so they have no composer or instrument; their titles can be
  edition names ("Nocturnes, Op.9"). Mutopia results carry both.
- No attribution is added to the PDF itself; Mutopia's and Commons's PDFs carry their own notices.
- Adding a source later means a new `parse…` function, an origin on the list and a row in `FIND_SOURCES`.
