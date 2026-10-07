---
title: Deployment to the Pi
status: shipped
updated: 2026-10-07
---

# Deployment

See [ADR 0005](../adr/0005-ci-cd-to-the-pi.md) and [ADR 0006](../adr/0006-google-gate-is-the-auth.md).

- Image: `ghcr.io/dewijones92/per-chordas-ad-astra` (amd64 + arm64), non-root uid 1000, tini, a healthcheck.
  It used 83 MiB of memory in a smoke test.
- Pi module: `~/code/dot-files/per-chordas-ad-astra/` (compose, `deploy.sh`, README).
- Pi state: `/var/lib/per-chordas-ad-astra/{data,secrets,state}`, never in git.
- URL: `https://per-chordas-ad-astra.333133333.xyz` (Google gate), plus a tile on privatearea.
- First CI deploy 2026-10-07 (`0.1.2`): healthy 20 s after the pull, 28 MiB in use; proven end to end in Dewi's
  signed-in Edge (a stroke drawn in the UI reached GitHub as its own commit about 22 s later).

Container environment: `DATA_REMOTE`, `DATA_SSH_KEY_FILE`, `DATA_KNOWN_HOSTS_FILE`, `TRUSTED_CIDRS`,
`COMMIT_IDLE_MS` (ms), `PUSH_RETRY_DELAYS_MS` (comma-separated ms), `GIT_AUTHOR_NAME/EMAIL`, `LOG_LEVEL`.

Uploads stream straight to disk with a running size cap (no multipart buffering): a 45 MB score peaked at
107 MB container memory (was 291 MB), and git stores big files without delta compression (`core.bigFileThreshold=4m`).
