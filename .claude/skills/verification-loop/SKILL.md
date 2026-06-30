---
name: verification-loop
description: Define a runnable success criterion and loop until it passes, then show evidence. Apply whenever you implement or fix something — turn the task into a check you can run yourself instead of guessing whether it works.
---

# Verification Loop

"Looks done" is not done. Define what success means as something you can *run*, then
loop until it holds — and show the evidence rather than asserting it.

## The loop

1. **Define the success criterion** as a concrete, runnable check before or while you
   implement. A test, a build exit code, a linter, a script that diffs output against
   a fixture, or a screenshot compared to a target. If the task came with a spec, the
   criteria are already there.
2. **Implement** the minimal change.
3. **Run the check.** Capture the actual output.
4. **If it fails, fix the root cause** — don't suppress the error or special-case the
   test — and run again.
5. **Repeat** until the check passes.
6. **Show the evidence.** The command you ran and what it returned, the test output,
   or the screenshot. Reviewing evidence is faster than re-running it yourself.

## Turning vague tasks into checks

| Vague | Verifiable |
|-------|-----------|
| "validate email addresses" | "`user@example.com` → true, `invalid` → false, `user@.com` → false; run the tests" |
| "make the dashboard look better" | "match this screenshot; screenshot the result and list the differences" |
| "the build is failing" | "fix the root cause so `npm run build` exits 0; show the output" |

## Rules

- Don't claim success without running the check. If you can't run it, say so and say
  what's needed.
- Fix root causes, not symptoms. Never edit a test to pass instead of fixing the code.
- For anything you'd ship, if you can't verify it, don't claim it's done.

## Escalating the gate (optional)

- **In one prompt:** ask for the check to run and iterate in the same message.
- **Across a session:** make it a Stop hook that blocks the turn until the check passes
  (see `.claude/hooks/README.md`).
- **Second opinion:** hand the diff to the `verifier` agent — a fresh context that
  grades the work it didn't write.
