#!/usr/bin/env bash
# PreToolUse hook for Write|Edit. Blocks edits to secret/sensitive files.
# Exit code 2 = block the tool call and feed stderr back to Claude.
#
# Claude Code passes the tool input as JSON on stdin. We extract the target
# file path and reject it if it matches a sensitive pattern.

set -euo pipefail

input="$(cat)"

# Pull the file path out of the JSON without requiring jq.
path="$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"

if [ -z "$path" ]; then
  exit 0
fi

base="$(basename "$path")"

# Patterns that should never be edited by the agent.
case "$base" in
  .env|.env.*)
    [ "$base" = ".env.example" ] && exit 0
    echo "BLOCKED: refusing to edit '$base'. Secrets live in .env (gitignored). Edit .env.example instead." >&2
    exit 2
    ;;
  *.pem|*.key|id_rsa|id_ed25519|*.p12|*.pfx)
    echo "BLOCKED: refusing to edit credential file '$base'." >&2
    exit 2
    ;;
  package-lock.json|pnpm-lock.yaml|yarn.lock|poetry.lock|Cargo.lock|go.sum)
    echo "BLOCKED: '$base' is a lockfile. Change dependencies via the package manager, not by hand-editing the lockfile." >&2
    exit 2
    ;;
esac

# Deny by directory too (secrets/, credentials/).
case "$path" in
  *secrets/*|*credentials/*)
    echo "BLOCKED: '$path' is under a secrets/credentials directory." >&2
    exit 2
    ;;
esac

exit 0
