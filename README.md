# Claude Vibe-Coding Starter Template

A general-purpose, stack-agnostic base structure for starting projects with Claude
Code. It bakes in two proven disciplines — **write less code** and **think before
coding, verify after** — as on-demand skills, agents, commands, and hooks, so every
new project starts fast without re-deriving the setup each time.

## Starting a new project (cleanest path)

This template lives at **[KyleSullivan321/Claude-Starter](https://github.com/KyleSullivan321/Claude-Starter)**,
marked as a GitHub *template repository* so new projects start with their own fresh
git history — no template history or leftover remote to clean up.

**Easiest — use the helper script** (wraps the GitHub template path, with an offline
local-copy fallback; handles `chmod`, `git init`, and the first commit for you):

```powershell
./new-project.ps1 my-app                 # Windows / PowerShell
```
```bash
./new-project.sh my-app                  # Git Bash / macOS / Linux
./new-project.sh my-app ~/work --local   # force offline local copy
```

**Or by hand:**

```bash
# GitHub template (cleanest — fresh history, needs the gh CLI):
gh repo create my-app --template KyleSullivan321/Claude-Starter --private --clone

# No gh / offline — degit-style copy with no history, then init your own:
npx degit KyleSullivan321/Claude-Starter my-app && cd my-app && git init
```

> Avoid a plain `git clone` of the template — it drags the template's history and
> `origin` along, so you'd have to `rm -rf .git && git init` every time. The template
> repo and the script avoid that entirely.

**Then, in the new project:**

1. **Fill in `CLAUDE.md`** — `Project specifics`, `Conventions`, `Gotchas`. Delete
   placeholders you don't need.
2. **Prune what you won't use.** Everything here is opt-in. Delete any skill, agent,
   command, rule, or hook that doesn't fit. Smaller is better.
3. **Start coding.** For a new feature: `/spec` → review the spec → fresh session →
   `/plan` → implement → `/ship`.

> The helper script re-runs `chmod +x .claude/hooks/*.sh`, because the executable bit
> is lost through GitHub-template/degit copies on Windows. If you start by hand, run
> that once yourself. `settings.local.json` is gitignored and intentionally does not
> travel — each person regenerates their own local overrides.

## What's in here

```
.
├── CLAUDE.md            # Lean project memory (loaded every session)
├── AGENTS.md            # Same rules, portable to non-Claude agents
├── SPEC.template.md     # Interview-driven spec starter
├── .env.example         # Copy to .env (gitignored)
├── .gitignore
└── .claude/
    ├── settings.json    # Permission allowlist + hook wiring (committed)
    ├── settings.local.json  # Your personal overrides (gitignored)
    ├── agents/          # Subagents — isolated context, fresh-eyes review
    ├── commands/        # Slash commands — repeatable workflows
    ├── skills/          # On-demand knowledge that won't bloat context
    ├── rules/           # Modular, path-scoped team instructions
    └── hooks/           # Deterministic guarantees (block secrets, etc.)
```

## Memory: how context persists across sessions

You don't re-explain the project every session. Three layers carry knowledge
forward, and the template uses all three:

| Layer | Who writes it | Committed? | Loaded |
|-------|---------------|-----------|--------|
| **`CLAUDE.md`** | You | ✅ shared | In full, every session — keep it lean |
| **`.claude/rules/`** | You | ✅ shared | Always, or only when matching files are touched (path-scoped) |
| **Auto memory** | Claude, automatically | ❌ private, machine-local | `MEMORY.md` index every session; topic files on demand |

**Auto memory** is the native feature that stops you re-contextualizing. It's **on by
default** (and set explicitly in `settings.json`). As Claude works it saves its own
notes — build quirks, debugging insights, preferences it discovers — to
`~/.claude/projects/<project>/memory/`. A concise `MEMORY.md` index auto-loads each
session; detailed topic files load only when needed. Browse or edit it with
`/memory`.

Two things to know for a **template**:
- Auto memory is keyed to the git repo and lives under `~/.claude/`, so it is **not**
  copied when you copy this folder — each new project gets its own clean memory. ✅
- It's **private and per-machine** — never committed or shared. Anything the *team*
  needs to persist goes in `CLAUDE.md` or `.claude/rules/` instead.

**Decision rule:** team-shared and stable → `CLAUDE.md` or `.claude/rules/`; private,
discovered-as-you-go → let auto memory handle it. When you correct the same thing
twice, promote it to the right shared layer.



### Skills (`.claude/skills/`)

Loaded on demand, so they don't cost context every session. Auto-trigger on
relevant work or invoke with `/<name>`.

| Skill | What it does |
|-------|--------------|
| `lazy-senior-dev` | The decision hierarchy — write the least code possible (YAGNI → stdlib → platform → installed dep → one line → minimal). |
| `think-before-coding` | Surface assumptions, present interpretations, push back before coding. |
| `surgical-changes` | Minimal-diff discipline — touch only what you must, match existing style. |
| `verification-loop` | Define a runnable success criterion and loop until it passes; show evidence. |

### Commands (`.claude/commands/`)

| Command | What it does |
|---------|--------------|
| `/spec` | Interview you about a feature, then write a self-contained `SPEC.md`. |
| `/plan` | Explore-first: read the relevant code, then produce an implementation plan. |
| `/review` | Fresh-context, severity-rated review of the current diff (bugs + simplification). |
| `/ship` | Verify (test/build/lint) → commit with a good message → open a PR. |
| `/cleanup` | Anti-slop pass: simplify, delete dead code, tighten the diff. |

### Agents (`.claude/agents/`)

Run in isolated context. The reviewer/verifier agents see only the diff and
criteria — they don't inherit the reasoning that wrote the code, which is the point.

| Agent | Role |
|-------|------|
| `planner` | Explore the codebase and design an implementation plan (read-heavy, no edits). |
| `code-reviewer` | Severity-rated review: logic defects, edge cases, simplification opportunities. |
| `security-reviewer` | OWASP Top 10, secrets, unsafe patterns. |
| `verifier` | Evidence-based completion check — did the work actually meet its criteria? |

### Hooks (`.claude/hooks/`)

Deterministic — they run regardless of what the model decides.

- `block-sensitive-files.sh` — blocks writes to `.env`, secret files, and lockfiles.
  Wired in `settings.json` under `hooks.PreToolUse`.
- See `.claude/hooks/README.md` to add auto-format / auto-lint on edit.

## The core workflow

```
/spec  →  (review spec)  →  fresh session  →  /plan  →  implement  →  /ship
                                                  ↑                     │
                                                  └──── /review ────────┘
```

The single highest-leverage habit: **give Claude a check it can run itself** (tests,
build, screenshot) so it closes its own loop instead of waiting for you to catch
mistakes.

## Optional add-ons (not included by default — add per project)

Kept out to stay lean and host-agnostic. Add when a project needs them:

- **MCP servers** (`.mcp.json`) — only the ones you use, e.g. `context7` for docs,
  Playwright for browser testing. Run `claude mcp add` or create `.mcp.json`.
- **GitHub Actions** (`.github/workflows/`) — PR-review-on-`@claude`, scheduled
  quality/dependency-audit jobs. Requires the Claude Code GitHub Action.
- **Stack-specific skills** — testing patterns, framework conventions, design tokens.
- **Path-scoped rules** — add `.claude/rules/*.md` as the project grows (see the
  starter in that directory) instead of growing `CLAUDE.md`.
- **Code-intelligence plugin** — for typed languages, gives precise symbol nav.

## Why this structure

It mirrors the official Claude Code best practices (lean `CLAUDE.md`, skills-first,
hooks for guarantees, subagents for isolation, a verification loop) and the
efficiency philosophy of the
[ponytail](https://github.com/DietrichGebert/ponytail) and
[andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
projects. Everything is documented so you can prune it with confidence per project.
