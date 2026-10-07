---
title: The Pi's Google gate is the only authentication
status: accepted
date: 2026-10-07
updated: 2026-10-07
---

# 0006 · The Google gate is the auth

## Decision

The app has no login of its own. It sits behind the Pi's existing oauth2-proxy + nginx `auth_request`
gate (the same block as `qbit.`, `proxy.` and `crashlog.`), on its own subdomain. The server refuses
every request (except `/healthz`) that does not come from a trusted network (`TRUSTED_CIDRS`, set to
the nginx network `172.21.0.0/16` on the Pi) and publishes no host port.

## Consequences

- One Google login covers the app and every other tile.
- The gate must be verified by the response BODY: a gated vhost returns the sign-in page with a 200.
