# AGENTS.md

Entry point for anyone, human or agent, working on per-chordas-ad-astra. Start here.

1. **[`CLAUDE.md`](CLAUDE.md)**: the binding project context. Decisions, the quality bar, architecture,
   commands, deployment and the gotchas already paid for. Read it first.
2. **[`docs/`](docs/README.md)**: living documentation with YAML frontmatter.
   - [`docs/spec.md`](docs/spec.md): what the app is, and the behaviours that must never break.
   - [`docs/architecture.md`](docs/architecture.md): how the pieces fit, and where each fact lives.
   - [`docs/features/`](docs/features/_index.md): one doc per feature.
   - [`docs/adr/`](docs/adr/_index.md): architecture decision records.
   - [`docs/todos/`](docs/todos/_index.md): the backlog.
   - [`docs/tests/`](docs/tests/_index.md): the testing strategy and what each e2e flow covers.

## Keep the docs current (part of "done")

A change is not done until the docs that describe it are true again, in the same commit:

- Ship or change a feature → update its `docs/features/<name>.md`.
- Make, change or reverse a decision → create, update or supersede its ADR in `docs/adr/`.
- Start, finish or drop backlog work → update `docs/todos/_index.md`.
- Add or move test coverage → update `docs/tests/_index.md`.

Bump each touched doc's `updated:` date. `pnpm preflight` checks the frontmatter and the indexes.
