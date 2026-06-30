---
description: Fresh-context, severity-rated review of the current diff (bugs + simplification).
---

Review the current change with fresh eyes.

Scope: $ARGUMENTS (default: the uncommitted diff / current branch vs. its base)

1. Get the diff (`git diff`, or against the base branch). Read surrounding code for
   context as needed.
2. Delegate to the `code-reviewer` agent so the review runs in a context that didn't
   write the code. For changes touching auth, input handling, data access, or
   external calls, also run the `security-reviewer` agent.
3. Report findings grouped by severity (🔴 Critical / 🟡 Important / 🟢 Minor), each
   with file:line and a concrete fix.

Only flag gaps that affect correctness, security, or the stated requirements — not
style preferences or speculative hardening. If the code is sound, say so. End with a
verdict: ship / fix-then-ship / needs-rework.
