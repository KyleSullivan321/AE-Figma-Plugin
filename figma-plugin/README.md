# AE → Figma Importer

Export an After Effects composition (layers, transforms, keyframes) into Figma,
rebuilding the layer hierarchy and animation in Figma's beta Motion editor.

## Two halves

| Half | File | Runs in |
|------|------|---------|
| Exporter | [`../ae-export.jsx`](../ae-export.jsx) | After Effects |
| Importer | `manifest.json` + `code.js` + `ui.html` | Figma |

They talk through one JSON file. No network, no install bridge.

## Use it

**In After Effects (install as a panel — one time):**
1. Copy `ae-export.jsx` into AE's ScriptUI Panels folder:
   `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`
2. In AE: `Edit ▸ Preferences ▸ Scripting & Expressions` → tick
   **Allow Scripts to Write Files and Access Network**.
3. Restart AE. The panel appears under the **`Window`** menu as **`ae-export.jsx`**.

**To export:**
1. Open/select a composition.
2. Open the panel (`Window ▸ ae-export.jsx`), click **Export composition…**.
3. Save the `.json` somewhere.

> Prefer not to install? `File ▸ Scripts ▸ Run Script File…` → pick `ae-export.jsx`
> still works — it opens as a floating window with the same button.

**In Figma:**
1. `Plugins ▸ Development ▸ Import plugin from manifest…` → pick `figma-plugin/manifest.json`.
2. Run the plugin, choose your `.json`, click **Import**.

## What's supported (v1)

- **Layers:** text, shape (as bounding rect + first fill), solid, image (still footage)
- **Transform:** position, scale, rotation, opacity, anchor
- **Hierarchy:** AE parenting rebuilt as nested Figma frames — an animated parent
  (e.g. a null-object rig) propagates its motion to children
- **Shapes:** rectangle, ellipse, star, polygon, and freeform bezier paths (real vectors)
- **Trim Paths:** the write-on / draw-on animation → Figma `PATH_TRIM_START/END`
- **Precomps:** nested compositions rebuilt as nested frames (transform + opacity inherit)
- **Drop Shadow** effect → Figma drop shadow; **multiple shapes** per layer preserved
- **Keyframes:** position / scale / rotation / opacity → Figma Motion tracks
- **Easing:** AE keyframe ease → cubic-bezier (influence → control points); hold supported
- **Images** are embedded base64 in the JSON and rebuilt as Figma image fills

## Known limits

- Shapes export as a filled bounding rectangle, not full vector paths.
- **Gradient fills/strokes**: AE doesn't expose gradient color stops to scripting, so
  gradients import as a gray placeholder in the correct orientation — recolor in Figma.
- **Text animators (per-char/word/line)** are not yet converted — text comes in static.
  Planned as its own pass (split text into per-unit nodes + staggered keyframes).
- Video/image-sequence footage not handled (still images only).
- **Parenting**: rebuilt as nested frames (position/rotation/scale inherit; opacity is
  per-layer, as in AE). Scale *inheritance* and non-center anchors on deep rigs are
  approximate. Adjustment layers are skipped (they're transparent in AE).
- Freeform bezier paths import as real Figma vectors. **Path morph** (vertices animating
  over time) is not reproduced — Figma has no vector-geometry keyframe track. **Trim Paths**
  (write-on) is supported. Scaled/rotated vector layers are approximate.
- Effects, masks, blend modes, expressions, 3D, cameras/lights: not exported.
- Easing is mapped coarsely (linear / hold / ease). Bezier control values are
  approximated.
- **Motion API is beta.** Keyframe property/easing enum names live in one map at the
  top of `code.js` (`MOTION_PROP`) and `mapEasing()` — if motion doesn't apply, those
  are the names to verify against the current API. Static import still works regardless.

## Dev

`node test-convert.js` runs the coordinate/value conversion self-check.
