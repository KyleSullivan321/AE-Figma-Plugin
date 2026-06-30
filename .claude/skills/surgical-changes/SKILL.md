---
name: surgical-changes
description: Keep edits minimal and scoped. Apply when modifying existing code — touch only what the task requires, match the existing style, and don't refactor or reformat unrelated code. Clean up only your own mess.
---

# Surgical Changes

Touch only what you must. Clean up only your own mess.

## Rules

1. **Change the minimum.** Edit only the lines the task actually requires. The diff
   should be as small as the task allows — a reviewer should be able to see exactly
   what changed and why.
2. **Match the existing style.** Naming, formatting, structure, and comment density
   should read like the code already there. Don't impose your preferences on a file
   that has its own conventions.
3. **Don't refactor on the side.** Resist the urge to "improve" unrelated code while
   you're in the file. If you spot something worth fixing, note it separately — don't
   fold it into this change.
4. **Don't reformat.** No mass whitespace, import-reordering, or formatter runs over
   untouched code. They bury the real change and make review harder.
5. **Clean up only what you touched.** Remove imports, variables, or helpers that
   *your* change made obsolete. Leave pre-existing cruft alone unless removing it is
   the task.

## Why it matters

A small, focused diff is easier to review, easier to revert, and less likely to
introduce unrelated regressions. A large diff that mixes the real change with
incidental edits hides bugs and wastes reviewer attention.

## When a bigger change is genuinely needed

If the task truly requires broad changes (a real refactor, a rename across files),
that's fine — but make it the explicit, stated task, ideally in its own commit,
separate from feature work. Don't smuggle it in.
