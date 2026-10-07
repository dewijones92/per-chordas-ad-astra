---
title: Architecture decision records
updated: 2026-10-07
---

# ADRs

| #                                                | Decision                                                   | Status             |
| ------------------------------------------------ | ---------------------------------------------------------- | ------------------ |
| [0001](0001-data-in-a-private-github-repo.md)    | Data in a private GitHub repo, via a clone on the Pi       | accepted           |
| [0002](0002-batched-autosave-commits.md)         | Autosave now, commit in batches, push with backoff         | accepted           |
| [0003](0003-annotations-as-vector-json.md)       | Annotations as vector JSON in PDF points                   | accepted           |
| [0004](0004-stack.md)                            | pnpm workspace, strict TS, React + Vite, Hono              | accepted           |
| [0005](0005-ci-cd-to-the-pi.md)                  | Multi-arch GHCR image; forced-command SSH deploy           | accepted           |
| [0006](0006-google-gate-is-the-auth.md)          | The Google gate is the only auth                           | accepted           |
| [0007](0007-native-pitch-preserving-playback.md) | Native pitch-preserving playback for the looper            | accepted           |
| [0008](0008-pdfjs-legacy-build.md)               | pdf.js legacy build, lazily loaded                         | accepted           |
| [0009](0009-resume-state-per-browser.md)         | Resume state per browser (localStorage)                    | superseded by 0010 |
| [0010](0010-resume-state-on-the-server.md)       | Resume state on the server, git-ignored, newest-wins merge | accepted           |

Format: `NNNN-title.md` with frontmatter (`status`, `date`, `updated`). Change a decision by updating
its ADR; reverse one by marking it `superseded by NNNN` and writing the new one, in the same commit as
the code.
