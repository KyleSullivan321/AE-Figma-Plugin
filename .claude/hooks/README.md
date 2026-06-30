# Hooks

Hooks run deterministically on Claude Code events, regardless of what the model
decides. They're wired in `.claude/settings.json` under the `hooks` key.

## Included

### `block-sensitive-files.sh` (PreToolUse: Write|Edit)

Blocks the agent from editing `.env`, credential files (`*.pem`, `*.key`, etc.),
lockfiles, and anything under `secrets/` or `credentials/`. Returns exit code `2`,
which blocks the tool call and tells Claude why.

## Add your own

Claude can write these for you — try *"write a hook that runs eslint after every
file edit"*. Or add them by hand in `settings.json`.

**Auto-format on edit** (PostToolUse) — wire a formatter to run after each write:

```json
"PostToolUse": [
  {
    "matcher": "Write|Edit",
    "hooks": [
      { "type": "command", "command": "npx prettier --write \"$CLAUDE_FILE_PATHS\"" }
    ]
  }
]
```

**Auto-lint / typecheck before finishing** (Stop) — gate the turn on a passing check:

```json
"Stop": [
  {
    "hooks": [
      { "type": "command", "command": "npm run lint && npm run typecheck" }
    ]
  }
]
```

Swap in your stack's commands. A Stop hook that exits non-zero keeps Claude working
until the check passes (Claude Code overrides after 8 consecutive blocks).

## Notes

- Hook scripts need to be executable on Unix: `chmod +x .claude/hooks/*.sh`.
- On Windows, the wired command invokes `bash`, which Claude Code's bundled Git Bash
  provides. Keep scripts POSIX `sh`/`bash`-compatible.
- `$CLAUDE_PROJECT_DIR` is the project root; `$CLAUDE_FILE_PATHS` is the edited file(s).
