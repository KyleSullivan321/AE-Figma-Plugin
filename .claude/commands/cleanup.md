---
description: Anti-slop pass — simplify, delete dead code, tighten the diff. Quality only, no behavior change.
---

Clean up the recent changes without altering behavior.

Scope: $ARGUMENTS (default: the current diff / recently modified files)

Make the code smaller and clearer while keeping all functionality identical:

1. **Delete the unnecessary.** Dead code, unused imports/variables, commented-out
   blocks, speculative features that aren't used, and abstractions with a single
   caller.
2. **Reuse instead of reinvent.** Replace hand-rolled logic with stdlib, a platform
   feature, or an already-installed dependency where it's clearly better.
3. **Reduce duplication.** Collapse copy-paste into one place — but only when it
   genuinely reduces complexity, not to chase cleverness.
4. **Match the surrounding style.** Naming, formatting, and comment density should
   read like the existing code.
5. **Keep changes surgical.** Touch only what cleanup requires. Don't reformat or
   refactor unrelated code.

This pass is **quality only** — it must not change behavior or hunt for bugs (use
`/review` for correctness). After cleaning, run the tests/build to confirm nothing
broke, and show the evidence.
