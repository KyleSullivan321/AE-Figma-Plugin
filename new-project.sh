#!/usr/bin/env bash
# Create a new project from the Claude-Starter template — cleanly, with its own
# fresh git history (no template history, no leftover remote).
#
# Prefers the GitHub template path (gh repo create --template) when gh is installed
# and authenticated; otherwise copies this template folder locally. Either way it
# ends with a clean repo: hooks executable, fresh git init, one initial commit.
#
# Usage:
#   ./new-project.sh <name> [parent-dir] [--public] [--local]
# Examples:
#   ./new-project.sh my-app
#   ./new-project.sh my-app ~/work --local

set -euo pipefail

TEMPLATE_REPO="KyleSullivan321/Claude-Starter"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NAME="${1:-}"
[ -z "$NAME" ] && { echo "Usage: $0 <name> [parent-dir] [--public] [--local]" >&2; exit 1; }
shift

PARENT="$(pwd)"
VISIBILITY="--private"
FORCE_LOCAL=0
for arg in "$@"; do
  case "$arg" in
    --public) VISIBILITY="--public" ;;
    --private) VISIBILITY="--private" ;;
    --local) FORCE_LOCAL=1 ;;
    *) PARENT="$arg" ;;
  esac
done

DEST="$PARENT/$NAME"
[ -e "$DEST" ] && { echo "Destination already exists: $DEST" >&2; exit 1; }

make_hooks_executable() {
  local dir="$1"
  if [ -d "$dir/.claude/hooks" ]; then
    chmod +x "$dir"/.claude/hooks/*.sh 2>/dev/null || true
    ( cd "$dir" && git update-index --add --chmod=+x .claude/hooks/*.sh 2>/dev/null || true )
  fi
}

init_clean_repo() {
  local dir="$1"
  ( cd "$dir"
    [ -d .git ] || git init -q
    git add -A
    # Mark hooks executable in the index AFTER staging, so the bit survives the commit.
    git update-index --chmod=+x .claude/hooks/*.sh 2>/dev/null || true
    git -c commit.gpgsign=false commit -q -m "Initial commit from Claude-Starter template"
  )
  echo "Initialized clean git repo with one commit."
}

GH_READY=0
if [ "$FORCE_LOCAL" -eq 0 ] && command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then GH_READY=1; fi
fi

if [ "$GH_READY" -eq 1 ]; then
  echo "Creating GitHub repo '$NAME' from template $TEMPLATE_REPO ..."
  ( cd "$PARENT" && gh repo create "$NAME" --template "$TEMPLATE_REPO" "$VISIBILITY" --clone )
  make_hooks_executable "$DEST"
  echo "Done. GitHub repo created with fresh history (template repos start clean)."
else
  if [ "$FORCE_LOCAL" -eq 1 ]; then
    echo "Local mode requested."
  else
    echo "gh CLI not available/authenticated — using local copy."
  fi
  echo "Copying template -> $DEST ..."
  mkdir -p "$DEST"
  # Copy everything except the template's .git and local-only overrides.
  ( cd "$TEMPLATE_DIR" && \
    git archive --format=tar HEAD 2>/dev/null | tar -x -C "$DEST" ) || {
      # Fallback if not a git checkout: plain copy minus .git
      cp -a "$TEMPLATE_DIR/." "$DEST/" && rm -rf "$DEST/.git"
    }
  rm -f "$DEST/.claude/settings.local.json"
  chmod +x "$DEST"/.claude/hooks/*.sh 2>/dev/null || true
  init_clean_repo "$DEST"
  echo "No remote set. Add one later with: git remote add origin <url> && git push -u origin main"
fi

cat <<EOF

Next steps:
  1. cd "$DEST"
  2. Fill in CLAUDE.md (Project specifics / Conventions / Gotchas).
  3. Prune any skill/agent/command/hook you won't use.
  4. Start: /spec -> review -> fresh session -> /plan -> /ship
EOF
