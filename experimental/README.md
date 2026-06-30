# Experimental

Not part of the supported export flow. Kept for anyone who wants to push the text-animator
work further.

- `diag-*.jsx` — ExtendScript diagnostics that dump AE keyframe ease, separated-dimension
  position, and text-animator structure to `%TEMP%`. Used to reverse-engineer what AE's
  scripting API actually exposes.
- `split-text.jsx` — work-in-progress: splits a text layer into one layer per character
  with baked position keyframes, to approximate a per-character text animator (handles the
  "Type Array V2" preset's Position case). Run it on a selected text layer, then export
  normally. Incomplete: Position only, linear between influence keyframes, kerning approximated.

AE text animators have no Figma equivalent (Figma keyframes whole nodes, not glyphs), so
faithful conversion requires splitting into per-unit nodes — that's what this explores.
