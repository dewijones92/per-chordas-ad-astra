---
title: Multi-arch GHCR image on native runners; CI deploys to the Pi over a forced-command SSH key
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0005 · CI/CD to the Pi

## Context

Dewi wanted a published Docker image built by CI/CD, run on his Raspberry Pi (arm64) from the dot-files
repo. He chose "CI deploys over SSH" over a Pi-side pull timer, with the key locked down to a forced
command. GHCR packages from a new repo may start private; he chose to pass CI's short-lived token
rather than click "make public".

## Decision

- **Build**: amd64 on `ubuntu-24.04`, arm64 on **`ubuntu-24.04-arm` natively** (QEMU builds took about an
  hour for a comparable image), push by digest, then one manifest tagged `sha-<7>`, `v0.1.<run>` and
  `latest`. The job fails unless both architectures are in the manifest.
- **Deploy**: a GitHub `production` environment, `main` only, gated by the repo variable
  `DEPLOY_ENABLED`. It SSHes as `pi` with a dedicated ed25519 key whose `authorized_keys` line is
  `restrict,command="/home/pi/code/dot-files/per-chordas-ad-astra/deploy.sh"`, with a pinned host key.
- The job sends `deploy <digest> <sha>` (read from `SSH_ORIGINAL_COMMAND`) and writes the GitHub actor
  and CI's `GITHUB_TOKEN` (packages:read, expires with the job) to stdin.
- **`deploy.sh`** validates the digest against `^sha256:[0-9a-f]{64}$` and the sha against `^[0-9a-f]{40}$`,
  logs in to GHCR with the stdin token, pulls by digest, logs out, recreates the container, waits for
  `/healthz` to report the new sha, and **rolls back to the previous digest and exits non-zero** if it
  does not. CI goes red on that exit code.

## Consequences

- A leaked deploy key can only redeploy an image already in GHCR; it cannot open a shell.
- Rolling back by hand is re-running an older green run's deploy job.
- The Pi's `:22` must stay reachable from GitHub's runners.
