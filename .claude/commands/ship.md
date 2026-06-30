---
description: Verify (test/build/lint) → commit with a good message → open a PR.
---

Finish and ship the current change. Do not skip verification.

1. **Verify.** Run the project's checks — tests, build, typecheck, lint (see
   `CLAUDE.md` for the commands). Show the actual output as evidence. If anything
   fails, fix the root cause and re-run until green. Don't suppress errors.
2. **Self-review.** Run `/review` on the diff first if it hasn't been reviewed.
   Address 🔴 and 🟡 findings.
3. **Commit.** Stage the change and write a descriptive commit message explaining
   *why*, not just *what*. One logical change per commit. If on the default branch,
   create a feature branch first.
4. **PR.** Push and open a pull request with `gh`, summarizing the change, the
   verification evidence, and anything a reviewer should focus on.

Only mark this done once the checks pass with evidence. If a check couldn't run, say
so explicitly rather than claiming success.

Extra context: $ARGUMENTS
