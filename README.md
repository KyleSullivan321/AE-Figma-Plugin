# AE → Figma

Export an After Effects composition — layers, transforms, and keyframe animation —
into Figma's new **Motion** editor (beta). Built to get ahead of the curve while Figma's
motion tooling is young: bring text, shapes, solids, and images out of an AE comp and
rebuild them in Figma with their hierarchy and animation intact.

> ⚠️ Figma's Motion API is in **beta**. This tool depends on it and may break as Figma
> changes the API. It's an early, ahead-of-the-curve project — expect rough edges.

## What it does

| | |
|---|---|
| **Layers** | text, shapes (bounding rect + first fill), solids, still images |
| **Transform** | position, scale, rotation, opacity, anchor |
| **Hierarchy** | AE parenting preserved as nested Figma frames |
| **Keyframes** | position / scale / rotation / opacity → Figma Motion tracks |
| **Easing** | AE keyframe ease → cubic-bézier (per-axis, dimension-separated aware); hold supported |

## How it works

Two halves joined by one JSON file — no network, no account, nothing to install but the
two scripts:

```
After Effects                         Figma
┌────────────────┐   comp.json +     ┌──────────────────────┐
│ ae-export.jsx  │   _assets/  ──▶   │ Figma plugin          │
│ (ExtendScript) │                   │ rebuilds layers +     │
│ reads the comp │                   │ keyframes + easing    │
└────────────────┘                   └──────────────────────┘
```

## Install & use

### 1. After Effects exporter

Copy [`ae-export.jsx`](ae-export.jsx) into AE's ScriptUI Panels folder:

- **Windows:** `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`
- **macOS:** `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/`

Then in AE: **Edit ▸ Preferences ▸ Scripting & Expressions** → enable **Allow Scripts to
Write Files and Access Network**. Restart AE. The panel appears under the **Window** menu.

> No install? **File ▸ Scripts ▸ Run Script File…** runs it ad-hoc as a floating window.

**To export:** select a composition, open the panel, click **Export composition…**, and
save the `.json`. Images are copied into a `<name>_assets` folder beside it.

### 2. Figma importer

1. **Plugins ▸ Development ▸ Import plugin from manifest…** → pick
   [`figma-plugin/manifest.json`](figma-plugin/manifest.json).
2. Run the plugin. In the file picker, select the `.json` (and, optionally, the images
   from its `_assets` folder — multi-select). Click **Import**.

Requires a Figma account with the Motion (beta) feature enabled for keyframes to apply;
without it, layers still import statically.

## Limitations

- Shapes export as a filled bounding rectangle, not full vector paths.
- **Text animators** (per-character/word/line) are not converted — text imports static.
  See [experimental/](experimental/) for in-progress per-character splitting.
- Video / image-sequence footage not handled (still images only).
- Effects, masks, blend modes, expressions, 3D, cameras/lights are not exported.
- Easing on 2D position is mapped per-axis; curved spatial motion paths are approximated.

## Development

```bash
node figma-plugin/test-convert.js   # conversion math self-check (no Figma needed)
```

The [`experimental/`](experimental/) folder holds diagnostic scripts and a work-in-progress
text-animator splitter — not part of the supported flow.

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, sell your services around it. No warranty.

If it saves you time, a [GitHub Sponsor](https://github.com/sponsors/KyleSullivan321) is
appreciated but never expected.
