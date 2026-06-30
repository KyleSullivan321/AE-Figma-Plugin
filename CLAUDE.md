# CLAUDE.md

> Project memory loaded every session. Keep it **short**. Only include what Claude
> can't infer by reading the code. If a rule is already followed without being
> written here, delete it. A bloated CLAUDE.md gets ignored.

## Operating philosophy

This project runs on two complementary disciplines. They live as on-demand skills
so they don't bloat context — invoke or let them auto-trigger:

- **Write less code.** Before writing anything, walk the decision hierarchy:
  does it need to exist (YAGNI) → stdlib → platform feature → installed dep →
  one line → only then minimal code. See `/lazy-senior-dev`.
- **Think before coding.** Surface assumptions, don't hide confusion, make
  surgical changes, and define success criteria you can verify. See
  `/think-before-coding`, `/surgical-changes`, `/verification-loop`.

**Non-negotiable even when minimizing:** trust-boundary input validation,
data-loss prevention, security, and accessibility are never cut to save code.

## Workflow

- **Explore → plan → implement → verify → commit.** For anything touching 2+ files
  or with an unclear approach, plan first (`/plan`). If you could describe the diff
  in one sentence, skip the plan and just do it.
- **Verify before claiming done.** Run the check (test, build, lint, screenshot)
  and show the evidence. "Looks done" is not done. See `/verification-loop`.
- **Separate authoring from review.** The context that wrote code does not approve
  it. Use a fresh review pass (`/review`) or the `code-reviewer` agent.

## Memory model — how context persists across sessions

Three layers carry knowledge between sessions so we don't re-explain things. Put
each fact in the right one:

- **CLAUDE.md (this file)** — stable, team-shared instructions. Committed. Loaded in
  full every session, so keep it lean. Build commands, conventions, architecture.
- **`.claude/rules/`** — modular team-shared instructions, optionally path-scoped so
  they only load when relevant files are touched. Committed. Use as this file grows.
- **Auto memory** (`~/.claude/projects/<project>/memory/`) — learnings Claude writes
  itself (build quirks, debugging insights, discovered preferences). **Private and
  machine-local — not committed, not shared.** On by default. Browse with `/memory`.

Decision rule: *team-shared and stable → CLAUDE.md or `.claude/rules/`. Private,
discovered-as-you-go → let auto memory handle it.* When you correct the same thing
twice, promote it: a shared convention goes in CLAUDE.md; a personal/machine quirk
stays in auto memory.

**When compacting, always preserve the list of modified files and the test/build
commands** so long sessions don't lose working state.

## Project specifics

<!-- FILL THIS IN per project. Delete the placeholders you don't need. -->

- **Stack:** <!-- e.g. TypeScript + React + Vite -->
- **Install:** <!-- e.g. npm install -->
- **Run / dev:** <!-- e.g. npm run dev -->
- **Test:** <!-- e.g. npm test  (prefer single tests over full suite for speed) -->
- **Lint / typecheck:** <!-- e.g. npm run lint && npm run typecheck -->
- **Build:** <!-- e.g. npm run build -->

## Conventions

<!-- Only list rules that DIFFER from language defaults Claude already knows. -->

- <!-- e.g. Use ES modules (import/export), not require -->
- <!-- e.g. Branch naming: feature/<short-desc>; never commit to main directly -->
- <!-- e.g. Never commit .env or secrets (also enforced by a hook) -->

## Gotchas

<!-- Non-obvious behaviors, required env vars, things that bite newcomers. -->

- <!-- e.g. DATABASE_URL must be set before running tests -->
