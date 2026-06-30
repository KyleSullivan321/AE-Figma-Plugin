# Project rules

Modular, team-shared instructions that keep `CLAUDE.md` from getting crowded as the
project grows. Every `.md` file here is discovered recursively and committed to git.

## Two kinds of rule

- **Unconditional** — no `paths` frontmatter. Loaded every session, same priority as
  `CLAUDE.md`. Use sparingly; this costs context every session just like CLAUDE.md.
- **Path-scoped** — has a `paths:` frontmatter list. Loads **only** when Claude works
  with matching files, so it costs nothing until it's relevant. Prefer this.

## Path-scoped example

```markdown
---
paths:
  - "src/api/**/*.{ts,tsx}"
---

# API rules
- Validate all input at the handler boundary.
- Use the standard error response shape.
- Version endpoints in the path (/v1/, /v2/).
```

See `example.md.txt` in this directory for a ready-to-rename starter.

## When to use rules vs. CLAUDE.md vs. skills vs. auto memory

| Need | Put it in |
|------|-----------|
| Stable rule that applies everywhere, every session | `CLAUDE.md` |
| Rule that only matters for certain files/dirs | `.claude/rules/` (path-scoped) |
| A multi-step procedure or workflow, loaded on demand | a skill (`.claude/skills/`) |
| A learning Claude discovered; private, machine-local | auto memory (`/memory`) |

Keep rules specific and verifiable ("use 2-space indent", not "format nicely").
Review periodically and delete anything outdated or contradictory — conflicting
rules make Claude pick one arbitrarily.
