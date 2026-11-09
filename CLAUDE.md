# per-chordas-ad-astra

_"Through the strings to the stars."_ Dewi's guitar practice web app: PDF scores you can draw on, a
metronome, a practice timer and log, a tuner and a slow-down looper. Everything you make is stored as
plain files in a **private GitHub repo**. The app runs as a Docker container on Dewi's Raspberry Pi,
behind the Google sign-in gate, at `https://per-chordas-ad-astra.333133333.xyz`.

Read [`AGENTS.md`](AGENTS.md) for the doc map. Decisions live in [`docs/adr/`](docs/adr/_index.md);
**CRUD the ADRs in the same commit as the code** (create on decide, update on change, supersede on
reversal).

## Decisions (agreed with Dewi, 7 Oct 2026)

| Decision                | Choice                                                                                                                                                 | ADR                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Where data lives        | A separate PRIVATE repo `dewijones92/per-chordas-ad-astra-data`, written through a git clone on the Pi with a deploy key that can reach only that repo | [0001](docs/adr/0001-data-in-a-private-github-repo.md)    |
| When edits reach GitHub | Saved to the Pi at once, committed after 20 s idle (or on leaving a piece / shutdown), pushed with backoff                                             | [0002](docs/adr/0002-batched-autosave-commits.md)         |
| Annotations             | Vector JSON in PDF points beside the untouched PDF                                                                                                     | [0003](docs/adr/0003-annotations-as-vector-json.md)       |
| Stack                   | pnpm workspace, strict TypeScript, React 19 + Vite, Hono on Node 24, one container                                                                     | [0004](docs/adr/0004-stack.md)                            |
| Delivery                | Multi-arch GHCR image built on native runners; CI deploys over a forced-command SSH key; pulls use CI's short-lived token                              | [0005](docs/adr/0005-ci-cd-to-the-pi.md)                  |
| Auth                    | The Pi's Google gate is the only login; the app trusts only the nginx network                                                                          | [0006](docs/adr/0006-google-gate-is-the-auth.md)          |
| Slow-down               | The browser's pitch-preserving `playbackRate`, not SoundTouch (a deviation from the first plan)                                                        | [0007](docs/adr/0007-native-pitch-preserving-playback.md) |
| PDF rendering           | pdf.js **legacy** build, loaded lazily                                                                                                                 | [0008](docs/adr/0008-pdfjs-legacy-build.md)               |
| Resume                  | Reopen at the last piece, page, looper spot and a paused timer, on any device; kept on the Pi outside git                                              | [0010](docs/adr/0010-resume-state-on-the-server.md)       |
| Play-along              | Our own MuseScore 2–4 and MusicXML reader, MuseScore's repeat tests as the oracle, Salamander piano samples, canvas falling notes                      | [0014](docs/adr/0014-play-along-own-parser.md)            |
| Notation                | Verovio (LGPL, in a worker, lazy) draws MusicXML; MuseScore converted by `to-musicxml.ts`; our play order drives the highlight                         | [0015](docs/adr/0015-notation-with-verovio.md)            |
| Preferences             | Metronome settings in the data repo (`settings.json`); zoom per score, page layout and library sort in the resume state                                | [0013](docs/adr/0013-where-preferences-live.md)           |
| Piano hands             | Guitar scores played on piano: the app splits notes between the hands (By part / By hand), thin octaves, ringing tails, a grand staff from the split   | [0018](docs/adr/0018-piano-hands-for-guitar-scores.md)    |
| Keys                    | One shortcut table; Space plays whatever is on screen, M runs the metronome                                                                            | [0020](docs/adr/0020-one-shortcut-table.md)               |
| Fingering               | Read from the file and shown in red; a File check says what a file was written for                                                                     | [0021](docs/adr/0021-fingering.md)                        |
| People                  | The gate's email says who; resume state, play-along settings, practice log and best speeds per person; `OWNER_PERSON` keeps old data the owner's       | [0019](docs/adr/0019-people-behind-the-gate.md)           |
| Look                    | Bold and playful, light theme only: white background, indigo/coral/sun/teal, sticker-style buttons                                                     | Dewi's choice                                             |
| Devices                 | Laptop/desktop first (mouse and trackpad drawing, keyboard shortcuts)                                                                                  | Dewi's choice                                             |

## Quality bar (copied in spirit from Totum, non-negotiable)

- **DRY and unified, as far as is reasonable** (Dewi, 24 Oct 2026: everything in this repo). A fact lives in
  one place: data shapes only in `packages/shared` (zod, used by both server and web), the Node version only in
  `.nvmrc` (preflight checks the Dockerfile agrees), test fixtures only in `packages/fixtures`. A job is done
  one way: before writing something new, look for the module that already does it (saving with retry, file
  uploads, drawing, key spelling, click sounds) and extend that rather than adding a second version, and keep
  the UI's controls, wording and shortcuts the same wherever the same thing appears. Before writing similar
  code twice, factor it; when you find two versions of one thing, merge them.
- **No duplication from a discussed idea** (Totum's rule, adopted 4 Nov 2026). Before building, search for code
  that already does each part, and name in the plan what each part **reuses**. Code one module needs but another
  owns is **moved** to a shared module, never rewritten. A new copy of existing logic needs a reason Dewi agreed.
- **Consistent everywhere; exceptions are discussed** (Totum's rule, adopted 4 Nov 2026). The same kind of thing
  looks, behaves and carries the same facts wherever it appears: the Score, Both and Notes views, the library card
  and the piece page, the metronome page and the dock, Dewi's session and his wife's. When a change touches one
  path, check its siblings. A deliberate exception is never built silently: ask Dewi, then record it in the ADR.
- **Every async operation shows itself** (Totum's rule, adopted 4 Nov 2026). Anything the user starts that does
  not finish at once (an upload, a file loading, the piano sounds loading, a save) shows what it is while it runs
  and ends with a visible result, ✅ or ❌, never silence.
- **Text wraps; nothing truncates.** No `text-overflow: ellipsis`; a row grows to fit its title (Totum's rule,
  adopted 4 Nov 2026; there are none today).
- **Testing pyramid, every time.** Many fast unit tests on pure modules (metronome scheduler, pitch
  maths, annotation history and geometry, page turning, sync engine against a real bare repo), a
  Playwright e2e for **every flow that matters**, run in CI. A bug fix lands with a test seen to fail
  first. Where several parts answer one question, test the answer end to end too.
- **Every UI string lives in `apps/web/src/strings.ts`, and visible text starts with an emoji** (Dewi, 24 Oct
  2026; ADR 0017). Visible text goes in `strings` (each starts with an emoji from the ADR's vocabulary), tooltips,
  placeholders and screen-reader labels in `tips` (plain), words between numbers in `units` (plain), the app's
  name and credits in `names`. Never type text inline in a component: `apps/web/test/strings.test.ts` fails on
  it, and on a visible string without an emoji. Text built in plain `.ts` files must go there too (the check
  cannot see it). e2e tests read labels from the same file.
- **Maximum compile-time safety.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  typescript-eslint `strictTypeChecked`, branded `Slug`/`FileName`, discriminated unions with
  exhaustive switches.
- **A UI change is not verified until the screen has been looked at.** Screenshot it. The four-week
  chart shipped broken behind green tests until a screenshot showed it (a global CSS class collision).
- **Log generously, prefix with `dewidebug`, keep the lines** until Dewi says otherwise. Log the
  decision and its inputs, and log why nothing happened. Server logs are pino JSON; the client uses
  `console.info('dewidebug …')`.
- **No new code comments.** The why goes in commit messages, ADRs and docs.
- CI must stay green. Commit at each green state.
- **Iterate quickly and shift left** (Totum's rule, adopted 4 Nov 2026). Treat a slow loop as a defect: measure
  where the minutes go, then move the check earlier and cheaper (a unit test instead of an e2e, one spec file
  instead of the suite, the e2e suite left to CI). When a cycle is slow, fix the tooling in that session.
- **Quick checks locally, the rest in CI** (Totum's rule, adopted 9 Nov 2026). Before a push run `pnpm quick`
  (preflight, format, lint, types, every unit test with coverage, build: about 50 s) and, when a flow changed, its own
  e2e spec file (`pnpm build && pnpm e2e e2e/<spec>.ts`); then push **only when its exit code is 0** and watch CI on
  that commit to its end, fixing a red run with the very next push. CI runs the full gate, e2e included (about 5½ of
  its 10 minutes), before it builds the image, so a red push never reaches the Pi. The full `pnpm gate` locally
  repeated all of that before every push. Kept local because CI cannot do them: looking at the changed screen, the
  real-file corpus (`MUSIC_CORPUS`) and the batch-end soak.
- **Suppressing a warning is Claude's call, case by case** (Totum's rule, adopted 9 Nov 2026), for eslint,
  TypeScript or any other check: when a rule fights the code's shape (a binary-format parser full of offsets, a
  table of constants), suppress it on that line and say why in the commit message; when it points at a real smell
  (dead code, a long function doing several things, a tangled condition), fix the code.
- **A doc's `status` is a claim, and a stale claim is worse than none.** When you touch an area, re-read its doc
  against the code and correct it; when a doc was wrong, say so in it rather than quietly fixing it.
- **Own the repo.** Take the structurally right option over the timid one (collapse duplicate types, rename for
  honesty, move code to where it belongs), with the gate green and one coherent commit per move. Surface only the
  decisions that are genuinely Dewi's: a behaviour change to something shipped, or a trade-off with no default.
- **How a batch runs** (Dewi, 24 Oct 2026, in the shape of Totum's):
  1. **Start with a discussion, grounded in the code.** Read (or send a Haiku scout through) the code each item
     touches first, so the questions come from what the code does. Then list what it will contain and ask Dewi the questions only he can
     answer (scope, defaults, trade-offs) with `AskUserQuestion`; write each decision into the ADRs or
     `docs/todos/_index.md` and the session's task file so it survives a context reset. Never ask what the code can answer.
  2. **Each feature ships on its own**, so Dewi can try it on the Pi straight away: tests (a bug fix's test seen red
     first), docs and ADRs in the same commit, `pnpm quick` (plus the changed flow's e2e spec), a look at the changed
     screen, then push **only when its exit code is 0** (`e=$?; [ $e -eq 0 ] && git push`). The push deploys once CI's
     full gate passes; watch CI until the Pi reports the new sha healthy. No review or soak per feature; do not hold features back waiting for one.
  3. **The batch ends with a soak, an Opus review and Haiku sweeps, in parallel.** The sweeps: one checks each
     change for consistency across every view and way in (Score, Both, Notes; library and piece page; both people),
     one looks for use cases the batch missed; a sweep's finding is a hypothesis to check against the code. The soak: three separate `pnpm e2e` runs
     (flakes are findings, not noise to retry past; not `--repeat-each`, which shares one data repo across repeats
     and fails a third of the suite on duplicate pieces, seen 24 Oct 2026), the opt-in real-file corpus (`MUSIC_CORPUS`, see `docs/tests/_index.md`) when the batch touched Play-along, and a look at every changed screen on
     the deployed build. The review: one `reviewer` agent (Opus, high effort) on the batch's commits, given Dewi's
     requests and the accepted decisions. Read the whole report, check each finding against the code, fix what holds
     up with a test seen red first, and push.
  4. **Then report** in the end-of-run shape (🚧 Needs you, Changed, 🔍 Found, ⚠️ Couldn't confirm).

## Architecture (short; see docs/architecture.md)

- `packages/shared`: zod schemas for every data file and API body, slug and file-name rules, sync
  status. The single source of truth for shapes.
- `packages/fixtures`: generated PDFs and WAV tones for unit and e2e tests (no binary fixtures).
- `apps/server`: Hono on Node 24, bundled by esbuild into one `server.mjs`.
  - `SyncEngine`: the git working copy. Debounced commits, push with backoff, rebase over remote
    edits, recovery of uncommitted files at startup, flush on SIGTERM.
  - `DataRepo`: domain operations on the files, each describing itself for the commit message.
  - `app.ts`: the HTTP API, a trusted-network guard (everything except `/healthz`), range-capable
    file serving (audio seeking needs it) and the SPA.
- `apps/web`: React 19 + Vite. `wouter` routing, no state library.
  - `score/`: pdf.js viewer with page / two-page / width layouts and page turning (`turn.ts`).
  - `annotate/`: an SVG layer in PDF points, a pure history reducer and geometry.
  - `metronome/`: a pure `TickScheduler` (anchor-based, drift-free), an app-wide Web Audio engine.
  - `music/`: Play-along: readers for MuseScore and MusicXML, repeat unrolling, a pure transport, the
    sampled piano and the falling-notes canvas (ADR 0014).
  - `tuner/`, `looper/`, `practice/`, `library/`, `sync/` (status pill).

## Build, test, run

```bash
pnpm install                 # pnpm 11; esbuild is the only package allowed to run install scripts
sh tools/install-hooks.sh    # once per clone: preflight on every push
pnpm quick                   # before a push (~50 s): preflight, format, lint, types, unit+coverage, build
pnpm gate                    # everything CI runs: quick + e2e (~6 min more); CI's job, run locally only when needed
pnpm test                    # vitest: shared, server (real git), web (jsdom)
pnpm build && pnpm e2e       # Playwright against the built server, bare repo standing in for GitHub
pnpm dev                     # vite on :5173 proxying /api to the server on :8787 (start the server yourself)
```

Run the server locally: `DATA_DIR=/tmp/pcaa-data STATIC_DIR=apps/web/dist PORT=8787 node apps/server/dist/server.mjs`.
With no `DATA_REMOTE` it keeps a local-only git repo (dev mode).

## Deployment

- Every push to `main`: gate → amd64 and arm64 images on native runners → one manifest at
  `ghcr.io/dewijones92/per-chordas-ad-astra:{sha-xxxxxxx,v0.1.N,latest}` → deploy job (only when the
  repo variable `DEPLOY_ENABLED` is `true`).
- The deploy job SSHes to `pi@333133333.xyz` with a key whose `authorized_keys` entry is
  `restrict,command="…/per-chordas-ad-astra/deploy.sh"`. It sends `deploy <digest> <sha>` and pipes
  CI's short-lived `GITHUB_TOKEN` on stdin for the pull. `deploy.sh` validates the digest, pulls by
  digest, recreates the container, waits for `/healthz` to report the new sha, and **rolls back and
  fails CI** if it does not.
- The Pi side lives in the dot-files repo: `~/code/dot-files/per-chordas-ad-astra/` (compose file,
  `deploy.sh`, README). Secrets and data live in `/var/lib/per-chordas-ad-astra/` on the Pi, never in git.
  Read the dot-files root `CLAUDE.md` before touching anything on the Pi.

## Gotchas already paid for

- **TypeScript is pinned to 6.0.x.** npm's `latest` is TS 7 (the native rewrite); typescript-eslint
  supports `<6.1`, and TS 7 ships no `tsserver.js`.
- **pdf.js 6's modern build needs Chrome 140+** (`Uint8Array.prototype.toHex`). Older browsers could
  not open any score, so we use the legacy build (ADR 0008).
- **Locally, run Playwright with Chromium 136**: `PW_CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1169/chrome-linux/chrome pnpm e2e`.
  Chromium 147+ cannot navigate on Dewi's WSL. CI uses Playwright's bundled browser. If port 8799 is taken (another
  project's server), set `E2E_PORT=8811`; never kill a process you did not start.
- **All CSS is global.** A generic class name in one stylesheet (`.empty`) silently restyled another
  feature. Use feature-prefixed or specific class names.
- **New React-hooks rules forbid resetting state at the top of an effect.** Derive "loading" from a
  keyed result instead (see `useAsync`, `useAnnotations`, `ScoreViewer`).
- **The tuner's first frames read a buffer half full of silence** and came out ~6 cents off; it now
  waits for two full analyser windows.
- **`pkill -f` matches its own shell** when the same command line contains the pattern. Stop local
  servers by PID file.
- **An autosave debounce can make a draw → undo → erase sequence save nothing at all**, correctly.
  Tests that expect a file must first wait for the earlier state to reach the remote.
- **Temporary files must live under `.state/tmp`, never beside their target.** The data dir is a git working tree, and
  `git add -A` would commit a half-written upload. (Independent review, 7 Oct 2026.)
- **A test that changes a per-person setting must wait for the server to hold its reset.** Resume state is pushed
  after a debounce and merged newest-wins, so a test that ticked 🎵 Start in C and unticked it at the end left the
  next tests opening in C major on CI's slower runner (8 failures, 4 Nov 2026) while passing locally. Use
  `learnKeySaved` (e2e helpers) or the same poll for any new setting.
- **A commit holds the repo gate from gathering its messages to `git commit`.** Without it a save landing in that
  window was staged into the commit under another change's message, and its own message was lost (4 Nov 2026).
- **Never send a whole document to change one part of it.** Loops were saved as the full `loops.json` from client
  state, so a save before the load (or after a track was removed) wiped other tracks' loops; it is per track now.
- **After a failed save, keep the last _confirmed_ version, not null.** One 502 used to stop every later drawing
  save, silently.
- **Only user intent records a resume position.** A restore scroll re-stamped stale positions as newest.
- **Nothing may appear or vanish above the score while it is open.** In Page layout pages are fitted to the score
  area's height, so a status strip that shows during a background check resizes every page and moves the reader's
  place; it failed CI (bookmark and cross-device resume) while passing locally, because the check was faster here.
  Reproduce timing bugs with `page.route` delaying the request, and never make the score read-only for a background
  task (strokes drawn meanwhile were dropped). (PDF-mark import, 9 Oct 2026.)
