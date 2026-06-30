---
description: Explore the relevant code, then produce an implementation plan before coding.
---

Plan the implementation before writing any code.

Task: $ARGUMENTS

1. **Explore first.** Read the relevant files. Understand existing patterns,
   conventions, and the flow you'll touch. If the exploration is broad, delegate it
   to the `planner` agent or use subagents so it doesn't fill this context.
2. **Apply the decision hierarchy** (see `/lazy-senior-dev`): does each piece need
   to exist? Can stdlib, a platform feature, or an installed dependency cover it
   before you write new code?
3. **Produce the plan:** goal, files to change (with reasons), ordered minimal
   steps, edge cases mapped to verification, what's out of scope, and the runnable
   checks that prove it works.
4. **Flag assumptions and forks.** Where two reasonable approaches exist, say so and
   recommend one — don't silently pick.

Present the plan and wait for approval before implementing. If the change is small
enough to describe in one sentence, say so and skip straight to doing it.
