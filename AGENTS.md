# AGENTS.md

> Universal agent rules, portable across coding agents (Claude Code, Cursor,
> Codex, Windsurf, Cline, Copilot, Aider, etc.). Claude Code reads `CLAUDE.md`;
> this file mirrors the same rules for other agents. Keep them in sync.

## Decision hierarchy — run before writing any code (first match wins)

1. **Does this need to exist at all?** (YAGNI) — skip it if not asked for.
2. **Does the standard library do it?** Use it.
3. **Does a native platform feature cover it?** Use it.
4. **Does an already-installed dependency solve it?** Use it. Don't add new deps.
5. **Can it be one line?** Make it one line.
6. **Only then:** write the minimum code that solves the problem.

Bias toward deletion over addition, boring over clever, fewest files possible.

## Four rules of engagement

1. **Think before coding.** Surface assumptions out loud. Present interpretations
   instead of silently picking one. Push back when a request looks wrong.
2. **Simplicity first.** Minimum code that solves the stated problem. Nothing
   speculative — no unrequested features, premature abstractions, or error
   handling for cases that can't happen.
3. **Surgical changes.** Touch only what you must. Match the existing style. Only
   remove imports/variables your own change made obsolete. Don't refactor
   unrelated code unless asked.
4. **Goal-driven execution.** Turn the request into a verifiable success criterion,
   then loop until it's met. Show the evidence (test output, build result,
   screenshot) rather than asserting success.

## Never cut these to save code

Trust-boundary input validation, data-loss prevention, security, and
accessibility. Efficiency through restraint, not carelessness.

## Marking tradeoffs

When you deliberately take a shortcut, mark it inline so it's findable later:

```
// TRADEOFF: O(n^2) scan, fine under ~1k items. Upgrade to a map if this grows.
```
