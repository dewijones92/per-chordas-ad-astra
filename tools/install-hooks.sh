#!/usr/bin/env sh
set -e
git config core.hooksPath .githooks
echo "hooks installed: preflight runs on every git push (bypass with --no-verify)"
