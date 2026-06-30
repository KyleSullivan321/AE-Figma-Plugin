---
description: Interview me about a feature, then write a self-contained SPEC.md.
---

Interview me about the feature I'm describing, then write a complete spec.

Feature: $ARGUMENTS

1. Use the `AskUserQuestion` tool to interview me. Ask about technical
   implementation, UI/UX, edge cases, concerns, and tradeoffs. **Don't ask obvious
   questions** — dig into the hard parts I might not have considered. Keep going
   until the important unknowns are resolved.
2. Apply the decision hierarchy as you go: prefer reusing stdlib, platform features,
   and already-installed dependencies over adding new ones. Surface where a simpler
   approach exists.
3. Write the result to `SPEC.md` using the structure in `SPEC.template.md`. Make it
   self-contained: name the files and interfaces involved, state what's out of
   scope, list edge cases, and end with concrete runnable verification criteria.

When the spec is written, tell me to review it and then start a **fresh session** to
implement it (clean context focused entirely on the build).
