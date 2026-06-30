# CLAUDE.md

AE → Figma: export an After Effects comp into Figma's Motion editor. Two halves joined by
one JSON file.

- **`ae-export.jsx`** — ExtendScript, runs in After Effects. Walks the active comp, emits
  JSON (layers, transforms, keyframes, easing, parenting) + copies images to a sidecar
  `_assets` folder. ExtendScript is old JS (no JSON object, no `btoa`) — keep that in mind.
- **`figma-plugin/`** — `manifest.json` + `code.js` + `ui.html`. Reads the JSON, rebuilds
  layers, applies keyframes via Figma's beta Motion API.
- **`experimental/`** — diagnostics + WIP text-animator splitter. Not the supported flow.

## Test

`node figma-plugin/test-convert.js` — pure conversion-math self-check (coordinates, easing
bezier, value mapping). No Figma runtime needed. Add a case here when changing that math.

## Gotchas (hard-won)

- **Easing:** AE separated-dimension Position stores real temporal ease only on the per-axis
  sub-props (`ADBE Position_0/_1`); the combined `Position` returns spatial-velocity garbage.
  Read per-axis. AE→bezier: `avg=|dv|/dt`, segment speed = `max(outSpeed,inSpeed)` for both
  y-handles, influence/100 for x.
- **Figma Motion:** `timelinePosition` is in **seconds** (not normalized). `TRANSLATION`/
  `ROTATION` additive (neutral 0), `SCALE` multiplicative (neutral 1), `OPACITY` absolute.
  `setTimelineDuration(timelineId, seconds)` — id from `node.timelines`.
- **Images:** base64-in-JSON hangs AE (slow ExtendScript string ops) — use sidecar files.
