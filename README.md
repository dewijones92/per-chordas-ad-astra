# per chordas ad astra ✦

_Through the strings to the stars._ A guitar practice app that keeps everything you make in a GitHub repo.

- 📄 Upload PDF scores and draw on them: pen, highlighter, text, arrows, boxes, fingering and strum
  stamps, bookmarks. Fit-page, two-page and fit-width layouts, arrow-key page turns.
- ⏱️ A sample-accurate metronome with accents, subdivisions, tap tempo and a speed trainer.
- 🎯 A practice timer that logs minutes and your best clean tempo, with streaks and a BPM chart.
- 🎤 A tuner with alternate tunings.
- 🔁 A slow-down looper: backing tracks at 50–125% speed without changing pitch, A-B loops you can name.
- 📚 Setlists, tags and fuzzy search.
- 🐙 Every change is committed to a private GitHub repo as readable files; the status pill shows
  whether your latest edit is on the server or already in GitHub.

## Run it

```bash
pnpm install && pnpm build
DATA_DIR=./.data STATIC_DIR=apps/web/dist PORT=8787 node apps/server/dist/server.mjs
# open http://localhost:8787
```

Or with Docker:

```bash
docker run -p 8080:8080 -v pcaa-data:/data -e TRUSTED_CIDRS=0.0.0.0/0 ghcr.io/dewijones92/per-chordas-ad-astra:latest
```

Set `DATA_REMOTE` (plus `DATA_SSH_KEY_FILE` and `DATA_KNOWN_HOSTS_FILE`) to push to a GitHub repo.
The app has no login of its own: put it behind an authenticating proxy, as described in
[ADR 0006](docs/adr/0006-google-gate-is-the-auth.md).

For contributors: start at [AGENTS.md](AGENTS.md).
