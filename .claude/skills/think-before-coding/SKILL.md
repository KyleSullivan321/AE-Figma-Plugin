---
name: think-before-coding
description: Surface assumptions and resolve ambiguity before writing code. Apply when a request is underspecified, has multiple valid interpretations, or when you're about to modify code you don't fully understand. Don't run with a guess.
---

# Think Before Coding

LLMs tend to make a wrong assumption, run with it silently, and overcomplicate the
result. This skill counters that. Don't assume. Don't hide confusion. Surface
tradeoffs.

## Before you write code

1. **State your assumptions out loud.** If the request leaves something open, say
   what you're assuming and why — don't bury the decision in the implementation.
2. **Present interpretations, don't silently pick one.** When a request can mean two
   things, lay out the options and recommend one. Let the user redirect cheaply now
   instead of expensively after you've built the wrong thing.
3. **Ask when it matters.** A clarifying question is cheap; building the wrong
   feature is not. Ask when the answer would change what you build. Don't ask about
   things you can determine by reading the code.
4. **Push back when a request looks wrong.** If the approach has a flaw, a simpler
   path exists, or it conflicts with the existing design, say so before coding.
5. **Understand before you modify.** Don't change code you don't understand. Read
   enough of the surrounding context to know why it's written the way it is.

## The bar

Before starting, you should be able to answer:
- What exactly is being asked, in one sentence?
- What am I assuming that could be wrong?
- Is there a simpler interpretation or approach?
- What does "done" look like, concretely and verifiably?

If you can't answer these, resolve that first. Five minutes of thinking saves an
hour of rework.

## Related

Pair with `surgical-changes` (keep the edit minimal), `lazy-senior-dev` (write the
least code), and `verification-loop` (prove it works).
