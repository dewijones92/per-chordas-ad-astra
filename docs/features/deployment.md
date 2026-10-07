---
title: Deployment to the Pi
status: in progress
updated: 2026-10-07
---

# Deployment

See [ADR 0005](../adr/0005-ci-cd-to-the-pi.md) and [ADR 0006](../adr/0006-google-gate-is-the-auth.md).

- Image: `ghcr.io/dewijones92/per-chordas-ad-astra` (amd64 + arm64), non-root uid 1000, tini, a healthcheck.
  It used 83 MiB of memory in a smoke test.
- Pi module: `~/code/dot-files/per-chordas-ad-astra/` (compose, `deploy.sh`, README).
- Pi state: `/var/lib/per-chordas-ad-astra/{data,secrets,state}`, never in git.
- URL: `https://per-chordas-ad-astra.333133333.xyz` (Google gate), plus a tile on privatearea.

Container environment: `DATA_REMOTE`, `DATA_SSH_KEY_FILE`, `DATA_KNOWN_HOSTS_FILE`, `TRUSTED_CIDRS`,
`COMMIT_IDLE_MS` (ms), `PUSH_RETRY_DELAYS_MS` (comma-separated ms), `GIT_AUTHOR_NAME/EMAIL`, `LOG_LEVEL`.
