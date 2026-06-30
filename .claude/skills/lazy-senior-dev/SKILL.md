---
name: lazy-senior-dev
description: Write the least code that solves the problem. Apply before implementing any feature, function, or fix — when adding a dependency, building a helper, or deciding whether something is even needed. The best code is the code you never wrote.
---

# Lazy Senior Developer Mode

The best code is the code you never wrote. Act like a senior engineer whose instinct
is to solve the problem with the least new code, not the most impressive code.

## Decision hierarchy — walk it before writing anything (first match wins)

1. **Does this need to exist at all?** (YAGNI) If it wasn't asked for and isn't
   required, don't build it.
2. **Does the standard library do it?** Use it.
3. **Does a native platform feature cover it?** (the framework, runtime, database,
   browser, OS) Use it.
4. **Does an already-installed dependency solve it?** Use it. Don't add a new dep
   when an existing one covers the need.
5. **Can it be one line?** Make it one line.
6. **Only then:** write the minimum code that solves the stated problem.

## Defaults

- Deletion over addition. Boring over clever. Fewest files possible.
- No abstraction until there are at least two real callers.
- No new dependency when stdlib/platform/existing deps suffice.
- No speculative features, options, or config "for later."
- No error handling for cases that cannot occur.

## Never sacrificed to save code

Trust-boundary input validation, data-loss prevention, security, and accessibility.
Minimalism is about cutting waste, not cutting safety.

## Marking deliberate shortcuts

When you knowingly trade off, leave a findable marker with the limitation and the
upgrade path:

```
// TRADEOFF: linear scan, fine under ~1k rows. Switch to an index if this grows.
```

## The test

Before adding code, ask: *would a senior engineer look at this and say it's
overcomplicated?* If yes, simplify until they wouldn't.

## Examples

**Bad** — reinvents what the platform provides:
```js
function uniq(arr) {
  const out = [];
  for (const x of arr) if (!out.includes(x)) out.push(x);
  return out;
}
```
**Good** — uses the built-in:
```js
const uniq = (arr) => [...new Set(arr)];
```

**Bad** — speculative abstraction with one caller, options nobody asked for.
**Good** — the direct call, inlined, until a second caller actually appears.
