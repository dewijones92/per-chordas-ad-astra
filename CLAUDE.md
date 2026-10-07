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
| Resume                  | Reopen at the last piece, page, looper spot and a paused timer; per browser                                                                            | [0009](docs/adr/0009-resume-state-per-browser.md)         |
| Look                    | Bold and playful, light theme only: white background, indigo/coral/sun/teal, sticker-style buttons                                                     | Dewi's choice                                             |
| Devices                 | Laptop/desktop first (mouse and trackpad drawing, keyboard shortcuts)                                                                                  | Dewi's choice                                             |

## Quality bar (copied in spirit from Totum, non-negotiable)

- **DRY, strictly.** A fact lives in one place: data shapes only in `packages/shared` (zod, used by
  both server and web), the Node version only in `.nvmrc` (preflight checks the Dockerfile agrees),
  test fixtures only in `packages/fixtures`. Before writing similar code twice, factor it.
- **Testing pyramid, every time.** Many fast unit tests on pure modules (metronome scheduler, pitch
  maths, annotation history and geometry, page turning, sync engine against a real bare repo), a
  Playwright e2e for **every flow that matters**, run in CI. A bug fix lands with a test seen to fail
  first. Where several parts answer one question, test the answer end to end too.
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
  - `tuner/`, `looper/`, `practice/`, `library/`, `sync/` (status pill).

## Build, test, run

```bash
pnpm install                 # pnpm 11; esbuild is the only package allowed to run install scripts
sh tools/install-hooks.sh    # once per clone: preflight on every push
pnpm gate                    # everything CI runs: preflight, format, lint, types, unit+coverage, build, e2e
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
  Chromium 147+ cannot navigate on Dewi's WSL. CI uses Playwright's bundled browser.
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
