// AE → Figma exporter. Dockable panel: appears under Window menu when this file is
// placed in AE's "Scripts/ScriptUI Panels" folder. Also runs standalone via
// File > Scripts > Run Script File... (opens as a floating window).
// Exports the ACTIVE composition to a JSON file the Figma plugin reads.
//
// Coordinate model: AE space is preserved. Positions are AE [x,y] (top-left origin,
// pixels). Parenting is preserved via parentIndex so Figma can rebuild the hierarchy.
// ponytail: file handoff via JSON. Add a live bridge only if manual file-pick is the bottleneck.

function exportComp() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Select/open a composition first, then run this script.");
        return;
    }

    var fps = comp.frameRate;

    // --- progress log (so a hang reveals WHERE it hung) -------------------
    // Writes/flushes each step to a file next to the temp dir. After a freeze,
    // open this file; the LAST line is the step that hung.
    var logFile = new File(Folder.temp.fsName + "/ae-figma-export.log");
    logFile.encoding = "UTF-8";
    logFile.open("w"); logFile.write("export start\n"); logFile.close();
    function plog(msg) {
        logFile.open("a"); logFile.write(msg + "\n"); logFile.close();
    }

    // --- helpers ----------------------------------------------------------

    function round(n) { return Math.round(n * 1000) / 1000; }

    // AE color channels are 0..1 floats; Figma wants 0..255 ints here, we keep 0..1
    // and let the Figma side use them directly (Figma RGB is also 0..1).
    function color(arr) {
        if (!arr) return null;
        return [round(arr[0]), round(arr[1]), round(arr[2])];
    }

    // Map an AE keyframe ease to a simple {influence, speed} pair per side.
    // Figma's API takes its own easing shapes; we hand it raw AE ease and convert
    // on the Figma side. Keep the data, decide the mapping later.
    function easeSide(ease) {
        if (!ease) return null;
        return { influence: round(ease.influence), speed: round(ease.speed) };
    }

    // Sample a property's keyframes into [{t, value, easeIn, easeOut, interp}].
    function keyframes(prop) {
        if (!prop || !prop.numKeys || prop.numKeys < 1) return null;
        var out = [];
        for (var i = 1; i <= prop.numKeys; i++) {
            var v = prop.keyValue(i);
            // normalize scalars/arrays to arrays for a stable schema
            var val = (v instanceof Array) ? [].concat(v) : [v];
            var inEase = null, outEase = null;
            try { inEase = easeSide(prop.keyInTemporalEase(i)[0]); } catch (e) {}
            try { outEase = easeSide(prop.keyOutTemporalEase(i)[0]); } catch (e) {}
            var interp = "LINEAR";
            try {
                var t = prop.keyOutInterpolationType(i);
                if (t === KeyframeInterpolationType.BEZIER) interp = "BEZIER";
                else if (t === KeyframeInterpolationType.HOLD) interp = "HOLD";
            } catch (e) {}
            out.push({
                t: round(prop.keyTime(i)),
                value: val.map(round),
                easeIn: inEase,
                easeOut: outEase,
                interp: interp
            });
        }
        return out;
    }

    // Static value of a transform prop (when not keyed), normalized to array.
    function staticVal(prop) {
        if (!prop) return null;
        var v = prop.value;
        var val = (v instanceof Array) ? [].concat(v) : [v];
        return val.map(round);
    }

    // When Position has separated dimensions, AE stores the real TEMPORAL ease ONLY on
    // the per-axis sub-properties (ADBE Position_0 / _1). The combined "ADBE Position"
    // returns spatial-velocity garbage (and throws on .value). So for separated position
    // we read each axis's 1D keyframes and zip them into the 2D [x,y] keyframe shape the
    // Figma side expects: value=[x,y], easeIn/easeOut taken per-axis from each sub-prop.
    function positionKeyframes(pos, tg) {
        var separated = false;
        try { separated = pos.dimensionsSeparated; } catch (e) {}
        if (!separated) return keyframes(pos);

        var px = null, py = null;
        try { px = tg.property("ADBE Position_0"); } catch (e) {}
        try { py = tg.property("ADBE Position_1"); } catch (e) {}
        var kx = keyframes(px), ky = keyframes(py);
        if (!kx && !ky) return null;
        // When only ONE axis is keyframed, the other axis is CONSTANT — use its static
        // value, not 0 (the bug that dropped a null's Y to 0 while X animated).
        var staticX = 0, staticY = 0;
        try { staticX = round(px.value); } catch (e) {}
        try { staticY = round(py.value); } catch (e) {}
        var n = Math.max(kx ? kx.length : 0, ky ? ky.length : 0);
        var out = [];
        for (var i = 0; i < n; i++) {
            var a = kx && kx[i], b = ky && ky[i];
            var base = a || b; // for shared t / interp
            // Per-axis ease: AE returns its own influence/speed for X vs Y. We keep BOTH
            // by storing arrays; the Figma side reads easeIn/easeOut[axis].
            out.push({
                t: base.t,
                value: [a ? a.value[0] : staticX, b ? b.value[0] : staticY, 0],
                easeIn:  [a ? a.easeIn  : null, b ? b.easeIn  : null],
                easeOut: [a ? a.easeOut : null, b ? b.easeOut : null],
                interp: base.interp,
                separated: true
            });
        }
        return out;
    }

    function transform(layer) {
        var tg = layer.property("ADBE Transform Group");
        function p(name) { try { return tg.property(name); } catch (e) { return null; } }
        var pos = p("ADBE Position");
        var scale = p("ADBE Scale");
        var rot = p("ADBE Rotate Z");
        var op = p("ADBE Opacity");
        var anchor = p("ADBE Anchor Point");
        // Separated-dimension position: the combined "ADBE Position" reports a wrong
        // (often comp-center) value instead of throwing, so we must check the flag and
        // read the per-axis sub-props explicitly. Same trap that hid the real easing.
        var posSeparated = false;
        try { posSeparated = pos && pos.dimensionsSeparated; } catch (e) {}
        var posStatic;
        if (posSeparated) {
            var sx = p("ADBE Position_0"), sy = p("ADBE Position_1");
            posStatic = [sx ? round(sx.value) : 0, sy ? round(sy.value) : 0, 0];
        } else {
            try { posStatic = staticVal(pos); } catch (e) { posStatic = [0, 0, 0]; }
        }
        return {
            position: posStatic,
            scale: staticVal(scale),
            rotation: staticVal(rot),
            opacity: staticVal(op),
            anchor: staticVal(anchor),
            keyframes: {
                position: positionKeyframes(pos, tg),
                scale: keyframes(scale),
                rotation: keyframes(rot),
                opacity: keyframes(op),
                anchor: keyframes(anchor)
            }
        };
    }

    function textInfo(layer) {
        try {
            var td = layer.property("ADBE Text Properties").property("ADBE Text Document").value;
            var info = {
                value: td.text,                       // may contain \n for multi-line
                fontSize: round(td.fontSize),
                font: td.font,                        // PostScript name (for loading)
                color: color(td.fillColor),
                justification: td.justification       // ParagraphJustification enum
            };
            // Extras for fidelity — all wrapped so an older AE that lacks one won't fail.
            try { info.fontFamily = td.fontFamily; } catch (e) {}
            try { info.fontStyle = td.fontStyle; } catch (e) {}     // e.g. "Bold", "Italic"
            try { info.tracking = round(td.tracking); } catch (e) {} // letter spacing (1/1000 em)
            try { if (!td.autoLeading) info.leading = round(td.leading); } catch (e) {} // line height px
            try { if (!td.applyFill) info.color = null; } catch (e) {} // no fill -> null
            try { if (td.applyStroke) info.stroke = { color: color(td.strokeColor), width: round(td.strokeWidth) }; } catch (e) {}
            try { if (td.boxText) info.boxSize = [round(td.boxTextSize[0]), round(td.boxTextSize[1])]; } catch (e) {}
            return info;
        } catch (e) { return null; }
    }

    // Solid + shape fill/size. Solids carry a color + source dimensions.
    function solidInfo(layer) {
        var src = layer.source;
        if (!src || !(src.mainSource instanceof SolidSource)) return null;
        return {
            color: color(src.mainSource.color),
            size: [round(src.width), round(src.height)]
        };
    }

    // Read supported effects. v1: Drop Shadow (maps cleanly to Figma's DROP_SHADOW).
    function effectsInfo(layer) {
        var out = [];
        var fx;
        try { fx = layer.property("ADBE Effect Parade"); } catch (e) { return out; }
        if (!fx) return out;
        for (var i = 1; i <= fx.numProperties; i++) {
            var ef = fx.property(i);
            try {
                if (ef.matchName === "ADBE Drop Shadow" && ef.enabled) {
                    out.push({
                        type: "dropShadow",
                        color: color(ef.property("ADBE Drop Shadow-0001").value),
                        opacity: round(ef.property("ADBE Drop Shadow-0002").value), // 0-255
                        direction: round(ef.property("ADBE Drop Shadow-0003").value), // degrees
                        distance: round(ef.property("ADBE Drop Shadow-0004").value),
                        softness: round(ef.property("ADBE Drop Shadow-0005").value)
                    });
                }
            } catch (e) {}
        }
        return out;
    }

    function shapeInfo(layer) {
        // Shapes are deeply nested; for v1 capture bounding size + first fill color +
        // a rectangle's corner roundness if present.
        // ponytail: full path/vector export deferred. Add when round-tripped vectors are needed.
        var size = null, fill = null, cornerRadius = null;
        try {
            var r = layer.sourceRectAtTime(0, false);
            size = [round(r.width), round(r.height)];
        } catch (e) {}
        try {
            var contents = layer.property("ADBE Root Vectors Group");
            var paints = firstPaints(contents);
            fill = paints.fill;                 // null if no fill or fill disabled
            var stroke = paints.stroke;         // {color, width} or null
            cornerRadius = firstRectRoundness(contents);
            var kind = firstShapeKind(contents);   // {type, points?, innerRatio?}
            var kindType = kind ? kind.type : "rect";
            var info = { size: size, fill: fill, stroke: stroke, cornerRadius: cornerRadius,
                         shapeKind: kindType,
                         points: kind ? kind.points : null,
                         innerRatio: kind ? kind.innerRatio : null,
                         roundness: kind ? kind.roundness : null,       // star point roundness (0-100)
                         outerRadius: kind ? kind.outerRadius : null };
            // Freeform bezier path -> export geometry + comp-space bounds (from the path,
            // NOT sourceRect, which is truncated when a Trim Paths modifier is mid-animation).
            if (kindType === "path") {
                info.path = extractPath(contents);
                info.pathBoundsComp = pathBoundsComp(layer, info.path);
            }
            info.trim = extractTrim(contents); // {start,end,offset} incl. keyframes, or null
            // Multiple shape groups in one layer -> export each as its own sub-shape so the
            // Figma side can render them separately (not one giant merged rect).
            var subs = extractSubShapes(layer, contents);
            if (subs && subs.length > 1) info.subShapes = subs;
            return info;
        } catch (e) {}
        return { size: size, fill: fill, stroke: null, cornerRadius: cornerRadius, shapeKind: "rect" };
    }

    // Each top-level "ADBE Vector Group" is one visible shape. Extract kind + geometry +
    // paints + its comp-space bounds (from the group's transform position). Returns an array.
    function extractSubShapes(layer, contents) {
        var out = [];
        if (!contents) return out;
        for (var i = 1; i <= contents.numProperties; i++) {
            var g = contents.property(i);
            if (g.matchName !== "ADBE Vector Group") continue;
            var inner = null;
            try { inner = g.property("ADBE Vectors Group"); } catch (e) {}
            if (!inner) continue;

            var kind = firstShapeKind(inner) || { type: "rect" };
            var paints = firstPaints(inner);
            var cr = firstRectRoundness(inner);

            // Group transform position (layer space) + primitive size.
            var gpos = [0, 0], gscale = [100, 100];
            try {
                var tg = g.property("ADBE Vector Transform Group");
                var p = tg.property("ADBE Vector Position").value; gpos = [p[0], p[1]];
                var sc = tg.property("ADBE Vector Scale").value; gscale = [sc[0], sc[1]];
            } catch (e) {}

            var sub = { shapeKind: kind.type, fill: paints.fill, stroke: paints.stroke,
                        cornerRadius: cr, points: kind.points || null, innerRatio: kind.innerRatio || null };

            // Layer-space bbox for this sub-shape, then map to comp for placement.
            var lbox = subShapeLayerBox(inner, gpos, gscale, kind);
            if (kind.type === "path") { sub.path = extractPath(inner); }
            sub.compBounds = mapLayerBoxToComp(layer, lbox);
            out.push(sub);
        }
        return out;
    }

    // Layer-space [minX,minY,maxX,maxY] of a sub-shape given its group position/scale.
    function subShapeLayerBox(inner, gpos, gscale, kind) {
        var sx = gscale[0] / 100, sy = gscale[1] / 100;
        function findPrim(group, mn) {
            for (var i = 1; i <= group.numProperties; i++) {
                var pr = group.property(i);
                if (pr.matchName === mn) return pr;
                try { if (pr.property("ADBE Vectors Group")) { var r = findPrim(pr.property("ADBE Vectors Group"), mn); if (r) return r; } } catch (e) {}
            }
            return null;
        }
        var cx = gpos[0], cy = gpos[1], hw = 50, hh = 50;
        try {
            if (kind.type === "rect" || kind.type === "ellipse") {
                var pm = findPrim(inner, kind.type === "rect" ? "ADBE Vector Shape - Rect" : "ADBE Vector Shape - Ellipse");
                var szName = kind.type === "rect" ? "ADBE Vector Rect Size" : "ADBE Vector Ellipse Size";
                var posName = kind.type === "rect" ? "ADBE Vector Rect Position" : "ADBE Vector Ellipse Position";
                var sz = pm.property(szName).value; hw = sz[0] / 2 * sx; hh = sz[1] / 2 * sy;
                try { var rp = pm.property(posName).value; cx += rp[0] * sx; cy += rp[1] * sy; } catch (e) {}
            } else if (kind.type === "star" || kind.type === "polygon") {
                var st = findPrim(inner, "ADBE Vector Shape - Star");
                var or = st.property("ADBE Vector Star Outer Radius").value; hw = or * sx; hh = or * sy;
            } else if (kind.type === "path") {
                var pth = extractPath(inner);
                if (pth && pth.verts.length) {
                    var xs = [], ys = [];
                    for (var v = 0; v < pth.verts.length; v++) { xs.push(gpos[0] + pth.verts[v][0] * sx); ys.push(gpos[1] + pth.verts[v][1] * sy); }
                    return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
                }
            }
        } catch (e) {}
        return [cx - hw, cy - hh, cx + hw, cy + hh];
    }

    function mapLayerBoxToComp(layer, lbox) {
        try {
            var savedTime = comp.time; comp.time = 0;
            var c = [
                layer.sourcePointToComp([lbox[0], lbox[1]]),
                layer.sourcePointToComp([lbox[2], lbox[1]]),
                layer.sourcePointToComp([lbox[2], lbox[3]]),
                layer.sourcePointToComp([lbox[0], lbox[3]])
            ];
            comp.time = savedTime;
            var xs = [c[0][0], c[1][0], c[2][0], c[3][0]], ys = [c[0][1], c[1][1], c[2][1], c[3][1]];
            var minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys);
            var maxX = Math.max.apply(null, xs), maxY = Math.max.apply(null, ys);
            return [round(minX), round(minY), round(maxX - minX), round(maxY - minY)];
        } catch (e) { return null; }
    }

    // Detect the first shape PRIMITIVE so Figma can create the matching node type instead
    // of always a rectangle. AE primitives: Rect, Ellipse, Star (star or polygon), and
    // freeform bezier groups (fallback to a rect bounding box).
    function firstShapeKind(group) {
        if (!group) return null;
        for (var i = 1; i <= group.numProperties; i++) {
            var pr = group.property(i);
            try {
                if (pr.matchName === "ADBE Vector Shape - Rect") return { type: "rect" };
                if (pr.matchName === "ADBE Vector Shape - Ellipse") return { type: "ellipse" };
                if (pr.matchName === "ADBE Vector Shape - Star") {
                    var isPolygon = false, pts = 5, inner = 0.5, outerRound = 0, outerR = 0;
                    try { isPolygon = (pr.property("ADBE Vector Star Type").value === 2); } catch (e) {}
                    try { pts = Math.round(pr.property("ADBE Vector Star Points").value); } catch (e) {}
                    try {
                        var ir = pr.property("ADBE Vector Star Inner Radius").value;
                        outerR = pr.property("ADBE Vector Star Outer Radius").value;
                        if (outerR) inner = round(ir / outerR);
                    } catch (e) {}
                    try { outerRound = round(pr.property("ADBE Vector Star Outer Roundness").value); } catch (e) {}
                    return { type: isPolygon ? "polygon" : "star", points: pts, innerRatio: inner,
                             roundness: outerRound, outerRadius: round(outerR) };
                }
                // A freeform path (ADBE Vector Shape - Group) -> vector; fall back to rect bbox.
                if (pr.matchName === "ADBE Vector Shape - Group") return { type: "path" };
            } catch (e) {}
            try {
                if (pr.property("ADBE Vectors Group")) {
                    var c = firstShapeKind(pr.property("ADBE Vectors Group"));
                    if (c) return c;
                }
            } catch (e) {}
        }
        return null;
    }

    // Extract the first freeform bezier path: {closed, verts, inTan, outTan} in LAYER space.
    // The path property "ADBE Vector Shape" lives inside a Path container ("ADBE Vector
    // Shape - Group"), so we recurse into both that and normal contents groups.
    function extractPath(group) {
        if (!group) return null;
        for (var i = 1; i <= group.numProperties; i++) {
            var pr = group.property(i);
            try {
                if (pr.matchName === "ADBE Vector Shape") {
                    var sh = pr.value;
                    var verts = [], inTan = [], outTan = [];
                    for (var v = 0; v < sh.vertices.length; v++) {
                        verts.push([round(sh.vertices[v][0]), round(sh.vertices[v][1])]);
                        inTan.push([round(sh.inTangents[v][0]), round(sh.inTangents[v][1])]);
                        outTan.push([round(sh.outTangents[v][0]), round(sh.outTangents[v][1])]);
                    }
                    return { closed: sh.closed, verts: verts, inTan: inTan, outTan: outTan };
                }
            } catch (e) {}
            try { if (pr.property("ADBE Vectors Group")) { var a = extractPath(pr.property("ADBE Vectors Group")); if (a) return a; } } catch (e) {}
            if (pr.matchName === "ADBE Vector Shape - Group") { try { var b = extractPath(pr); if (b) return b; } catch (e) {} }
        }
        return null;
    }

    // Extract the first Trim Paths modifier: start/end/offset (0-100 %) with keyframes.
    function extractTrim(group) {
        if (!group) return null;
        for (var i = 1; i <= group.numProperties; i++) {
            var pr = group.property(i);
            try {
                if (pr.matchName === "ADBE Vector Filter - Trim") {
                    function tp(nm) { try { return pr.property(nm); } catch (e) { return null; } }
                    var s = tp("ADBE Vector Trim Start"), en = tp("ADBE Vector Trim End"), of = tp("ADBE Vector Trim Offset");
                    return {
                        start: s ? round(s.value) : 0, startKeys: keyframes(s),
                        end: en ? round(en.value) : 100, endKeys: keyframes(en),
                        offset: of ? round(of.value) : 0
                    };
                }
            } catch (e) {}
            try { if (pr.property("ADBE Vectors Group")) { var t = extractTrim(pr.property("ADBE Vectors Group")); if (t) return t; } } catch (e) {}
        }
        return null;
    }

    // Comp-space bounding box of the RENDERED path curve (not the control points, which
    // over-inflate the box). We sample each cubic bezier segment densely and map points to
    // comp space (pinned at t=0) — this matches how Figma computes a vector's bbox, so the
    // imported node's x/y aligns. Avoids the Trim-truncated sourceRect. Returns [x,y,w,h].
    function pathBoundsComp(layer, path) {
        if (!path || !path.verts.length) return null;
        try {
            var savedTime = comp.time; comp.time = 0;
            var V = path.verts, IN = path.inTan, OUT = path.outTan, n = V.length;
            var xs = [], ys = [];
            function sampleSeg(a, b) {
                var p0 = V[a], p1 = [V[a][0] + OUT[a][0], V[a][1] + OUT[a][1]];
                var p2 = [V[b][0] + IN[b][0], V[b][1] + IN[b][1]], p3 = V[b];
                for (var s = 0; s <= 24; s++) {
                    var t = s / 24, u = 1 - t;
                    var bx = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
                    var by = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
                    var c = layer.sourcePointToComp([bx, by]);
                    xs.push(c[0]); ys.push(c[1]);
                }
            }
            for (var i = 0; i < n - 1; i++) sampleSeg(i, i + 1);
            if (path.closed && n > 1) sampleSeg(n - 1, 0);
            comp.time = savedTime;
            var minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys);
            var maxX = Math.max.apply(null, xs), maxY = Math.max.apply(null, ys);
            return [round(minX), round(minY), round(maxX - minX), round(maxY - minY)];
        } catch (e) { return null; }
    }

    // Return the first ENABLED fill color and the first ENABLED stroke (color + width).
    // A disabled paint (the eyeball off / "no fill") must NOT be exported — AE keeps the
    // color value even when the paint is off, so we gate on `enabled`.
    // Gradient LIMITATION: AE's "ADBE Vector Grad Colors" is PropertyValueType.NO_VALUE -
    // the color stops are not exposed to scripting. So for gradients we export GEOMETRY
    // (linear/radial + start/end points) with a flag; the Figma side renders a visible
    // placeholder gradient in the right orientation and logs that colors can't be ported.
    function gradInfo(pr) {
        var g = { gradient: true };
        try { g.gradType = pr.property("ADBE Vector Grad Type").value; } catch (e) {} // 1=linear 2=radial
        try { var s = pr.property("ADBE Vector Grad Start Pt").value; g.start = [round(s[0]), round(s[1])]; } catch (e) {}
        try { var en = pr.property("ADBE Vector Grad End Pt").value; g.end = [round(en[0]), round(en[1])]; } catch (e) {}
        return g;
    }

    // Stroke line join / cap -> Figma names. AE: join 1=miter 2=round 3=bevel;
    // cap 1=butt 2=round 3=square. A ROUND join is what softens star/corner points.
    function strokeJoin(pr) {
        try {
            var j = pr.property("ADBE Vector Stroke Line Join").value;
            return j === 2 ? "ROUND" : j === 3 ? "BEVEL" : "MITER";
        } catch (e) { return null; }
    }
    function strokeCap(pr) {
        try {
            var c = pr.property("ADBE Vector Stroke Line Cap").value;
            return c === 2 ? "ROUND" : c === 3 ? "SQUARE" : "NONE";
        } catch (e) { return null; }
    }

    function firstPaints(group) {
        var result = { fill: null, stroke: null };
        function walk(g) {
            if (!g) return;
            for (var i = 1; i <= g.numProperties; i++) {
                var pr = g.property(i);
                try {
                    var mn = pr.matchName;
                    if (mn === "ADBE Vector Graphic - Fill" && result.fill === null && pr.enabled) {
                        result.fill = color(pr.property("ADBE Vector Fill Color").value);
                    } else if (mn === "ADBE Vector Graphic - G-Fill" && result.fill === null && pr.enabled) {
                        result.fill = gradInfo(pr);
                    } else if (mn === "ADBE Vector Graphic - Stroke" && result.stroke === null && pr.enabled) {
                        result.stroke = {
                            color: color(pr.property("ADBE Vector Stroke Color").value),
                            width: round(pr.property("ADBE Vector Stroke Width").value),
                            join: strokeJoin(pr), cap: strokeCap(pr)
                        };
                    } else if (mn === "ADBE Vector Graphic - G-Stroke" && result.stroke === null && pr.enabled) {
                        var gs = gradInfo(pr);
                        try { gs.width = round(pr.property("ADBE Vector Stroke Width").value); } catch (e) {}
                        gs.join = strokeJoin(pr); gs.cap = strokeCap(pr);
                        result.stroke = gs;
                    }
                } catch (e) {}
                try { if (pr.property("ADBE Vectors Group")) walk(pr.property("ADBE Vectors Group")); } catch (e) {}
            }
        }
        walk(group);
        return result;
    }

    // Find the first rectangle's corner roundness (AE "Rectangle Path > Roundness").
    function firstRectRoundness(group) {
        if (!group) return null;
        for (var i = 1; i <= group.numProperties; i++) {
            var pr = group.property(i);
            try {
                if (pr.matchName === "ADBE Vector Shape - Rect") {
                    return round(pr.property("ADBE Vector Rect Roundness").value);
                }
            } catch (e) {}
            try {
                if (pr.property("ADBE Vectors Group")) {
                    var c = firstRectRoundness(pr.property("ADBE Vectors Group"));
                    if (c !== null) return c;
                }
            } catch (e) {}
        }
        return null;
    }

    function layerType(layer) {
        if (layer instanceof TextLayer) return "text";
        if (layer instanceof ShapeLayer) return "shape";
        // Null objects have a SolidSource but must NOT render (they're invisible rigs in AE).
        // Detected before "solid" so they don't come across as white squares.
        try { if (layer.nullLayer) return "null"; } catch (e) {}
        if (layer.source && layer.source.mainSource instanceof SolidSource) return "solid";
        // A layer whose source is another composition -> precomp (recurse into it).
        if (layer.source && (layer.source instanceof CompItem)) return "precomp";
        // Footage backed by a still-image file -> image layer.
        if (layer.source && layer.source.mainSource instanceof FileSource
            && layer.source.mainSource.file && isImageFile(layer.source.mainSource.file)) {
            return "image";
        }
        return "other";
    }

    function isImageFile(f) {
        var n = f.name.toLowerCase();
        return /\.(png|jpg|jpeg|gif|webp|bmp|tif|tiff)$/.test(n);
    }

    // Read an image file and base64-encode it so the Figma plugin can rebuild it
    // (the plugin sandbox can't read disk paths). Returns {dataB64, mime, size}.
    // ponytail: base64-in-JSON. Bloats the file for big images; switch to sidecar
    //   files only if export size becomes a problem.
    // Record the image's source file + filename. The actual copy happens AFTER the save
    // dialog (we need the JSON location). No base64 here: encoding multi-MB images in
    // ExtendScript hangs AE. Figma reads the sidecar file natively instead.
    var imageSources = []; // {file: File, name: String} to copy beside the JSON
    function imageInfo(layer) {
        var src = layer.source.mainSource;
        var f = src.file;
        if (!f || !f.exists) return null;
        plog("  imageInfo: " + f.fsName + " (" + f.length + " bytes)");
        imageSources.push({ file: f, name: f.name });
        return {
            file: f.name, // sidecar filename; bytes loaded by the Figma plugin
            size: [round(layer.source.width), round(layer.source.height)]
        };
    }

    // --- walk layers (recursive: precomps recurse into their source comp) --

    // Walk one composition's layers into an array of entries. `theComp` is the comp being
    // walked (main comp, or a precomp's source). Recurses for precomp layers, so nested
    // comps come through as nested Figma frames. `depth` guards against pathological nesting.
    function walkComp(theComp, depth) {
        plog("walk comp '" + theComp.name + "' (" + theComp.numLayers + " layers, depth " + depth + ")");
        var out = [];
        if (depth > 8) return out; // safety: absurdly deep nesting
        for (var i = 1; i <= theComp.numLayers; i++) {
            var L = theComp.layer(i);
            var type = layerType(L);
            plog("  layer " + i + " '" + L.name + "' type=" + type);
            if (type === "other") continue;
            var isAdjustment = false;
            try { isAdjustment = L.adjustmentLayer; } catch (e) {}
            if (isAdjustment) { plog("    skip adjustment layer"); continue; }

            var sr = null;
            try {
                var r = L.sourceRectAtTime(0, false);
                sr = [round(r.left), round(r.top), round(r.width), round(r.height)];
            } catch (e) {}

            // Comp-space bounds + anchor, pinned at t=0, in THIS comp's space (precomp
            // sub-layers map into the precomp's space — the Figma precomp frame represents it).
            var compBounds = null, anchorComp = null, baselineComp = null;
            try {
                if (sr) {
                    var savedTime = theComp.time;
                    theComp.time = 0;
                    var cs = [
                        L.sourcePointToComp([sr[0], sr[1]]),
                        L.sourcePointToComp([sr[0] + sr[2], sr[1]]),
                        L.sourcePointToComp([sr[0] + sr[2], sr[1] + sr[3]]),
                        L.sourcePointToComp([sr[0], sr[1] + sr[3]])
                    ];
                    var av = [0, 0];
                    try { var a = L.property("ADBE Transform Group").property("ADBE Anchor Point").value; av = [a[0], a[1]]; } catch (e) {}
                    var ac = L.sourcePointToComp(av);
                    // Text baseline origin: the layer's [0,0] point is the first-line baseline.
                    // Used to align split-word text by baseline (consistent) not tight-bbox top.
                    if (type === "text") { var bl = L.sourcePointToComp([0, 0]); baselineComp = [round(bl[0]), round(bl[1])]; }
                    theComp.time = savedTime;
                    var xs = [cs[0][0], cs[1][0], cs[2][0], cs[3][0]];
                    var ys = [cs[0][1], cs[1][1], cs[2][1], cs[3][1]];
                    var minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys);
                    var maxX = Math.max.apply(null, xs), maxY = Math.max.apply(null, ys);
                    compBounds = [round(minX), round(minY), round(maxX - minX), round(maxY - minY)];
                    anchorComp = [round(ac[0]), round(ac[1])];
                }
            } catch (e) {}

            var entry = {
                index: L.index,
                name: L.name,
                type: type,
                parentIndex: L.parent ? L.parent.index : null,
                inPoint: round(L.inPoint),
                outPoint: round(L.outPoint),
                sourceRect: sr,
                compBounds: compBounds,
                anchorComp: anchorComp,
                baselineComp: baselineComp, // text: first-baseline origin in comp space
                transform: transform(L),
                effects: effectsInfo(L)
            };

            if (type === "text") entry.text = textInfo(L);
            else if (type === "solid") entry.solid = solidInfo(L);
            else if (type === "shape") entry.shape = shapeInfo(L);
            else if (type === "image") {
                entry.image = imageInfo(L);
                if (!entry.image) continue;
            } else if (type === "precomp") {
                // Recurse into the nested composition; its layers become the precomp's
                // subLayers, rebuilt as a nested Figma frame sized to the precomp.
                var sub = L.source;
                entry.subComp = { width: sub.width, height: sub.height, duration: round(sub.duration) };
                entry.subLayers = walkComp(sub, depth + 1);
            }

            out.push(entry);
        }
        return out;
    }

    var layers = walkComp(comp, 0);

    var data = {
        schema: 1,
        comp: {
            name: comp.name,
            width: comp.width,
            height: comp.height,
            duration: round(comp.duration),
            frameRate: round(fps)
        },
        layers: layers
    };

    // --- serialize (ExtendScript has no JSON) -----------------------------

    plog("serializing " + layers.length + " layers...");
    var json = stringify(data);
    plog("serialized: " + json.length + " chars");

    var file = File.saveDialog("Save comp JSON for Figma", "*.json");
    if (!file) return;
    if (file.name.indexOf(".json") === -1) file = new File(file.fsName + ".json");
    file.encoding = "UTF-8";
    file.open("w");
    // Write in chunks: ExtendScript File.write can choke/truncate on multi-MB strings.
    plog("writing file...");
    var CHUNK = 1 << 20; // 1 MB
    for (var off = 0; off < json.length; off += CHUNK) {
        file.write(json.substr(off, CHUNK));
    }
    file.close();
    plog("write done: " + file.fsName);

    // Copy images into a sidecar folder beside the JSON so Figma can load them.
    var copied = 0;
    if (imageSources.length) {
        var base = file.name.replace(/\.json$/i, "");
        var assets = new Folder(file.parent.fsName + "/" + base + "_assets");
        if (!assets.exists) assets.create();
        for (var ci = 0; ci < imageSources.length; ci++) {
            var dst = new File(assets.fsName + "/" + imageSources[ci].name);
            if (imageSources[ci].file.copy(dst)) copied++;
            else plog("  copy failed: " + imageSources[ci].name);
        }
        plog("copied " + copied + "/" + imageSources.length + " images to " + assets.fsName);
    }

    alert("Exported " + layers.length + " layers to:\n" + file.fsName +
          (imageSources.length ? ("\n" + copied + " image(s) copied to the _assets folder.") : ""));

    // Minimal JSON serializer (ExtendScript's JS engine predates JSON).
    function stringify(v) {
        if (v === null || v === undefined) return "null";
        var t = typeof v;
        if (t === "number") return isFinite(v) ? String(v) : "null";
        if (t === "boolean") return v ? "true" : "false";
        if (t === "string") return quote(v);
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(stringify(v[i]));
            return "[" + a.join(",") + "]";
        }
        var props = [];
        for (var k in v) {
            if (v.hasOwnProperty(k)) props.push(quote(k) + ":" + stringify(v[k]));
        }
        return "{" + props.join(",") + "}";
    }

    function quote(s) {
        s = String(s);
        // Fast path: nothing needing escaping (covers base64 image blobs, plain text).
        // Avoids a per-char O(n^2) string build over multi-MB strings - the AE freeze.
        if (!/[\x00-\x1f"\\]/.test(s)) return '"' + s + '"';
        var parts = ['"'];
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i), code = s.charCodeAt(i);
            if (c === '"') parts.push('\\"');
            else if (c === '\\') parts.push('\\\\');
            else if (c === '\n') parts.push('\\n');
            else if (c === '\r') parts.push('\\r');
            else if (c === '\t') parts.push('\\t');
            else if (code < 32) parts.push('\\u' + ('0000' + code.toString(16)).slice(-4));
            else parts.push(c);
        }
        parts.push('"');
        return parts.join("");
    }
}

// --- dockable panel ---------------------------------------------------------
// When AE launches a ScriptUI Panel, it passes the panel object as `this`. Run from
// File > Scripts and `this` is undefined, so we make our own floating Window instead.
(function (thisObj) {
    var win = (thisObj instanceof Panel)
        ? thisObj
        : new Window("palette", "AE to Figma Exporter", undefined, { resizeable: true });

    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = 12;
    win.spacing = 8;

    win.add("statictext", undefined, "Export the active composition to JSON,");
    win.add("statictext", undefined, "then import it in the Figma plugin.");

    var btn = win.add("button", undefined, "Export composition…");
    btn.onClick = function () { exportComp(); };

    // Honest heads-up: what the exporter cannot bring across, so results aren't surprising.
    var note = win.add("panel", undefined, "What won't transfer");
    note.orientation = "column";
    note.alignChildren = ["left", "top"];
    note.margins = 10;
    note.spacing = 3;
    var limits = [
        "• Text animators (per-char/word/line)",
        "• Gradient colors (imports as gray placeholder)",
        "• Path morph animation (trim/write-on IS supported)",
        "• Effects except Drop Shadow; masks, blend modes",
        "• 3D layers, cameras, lights",
        "• Adjustment layers (skipped)"
    ];
    for (var i = 0; i < limits.length; i++) note.add("statictext", undefined, limits[i]);

    win.layout.layout(true);
    if (win instanceof Window) { win.center(); win.show(); }
})(this);
