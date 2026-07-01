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
        var n = Math.max(kx ? kx.length : 0, ky ? ky.length : 0);
        var out = [];
        for (var i = 0; i < n; i++) {
            var a = kx && kx[i], b = ky && ky[i];
            var base = a || b; // for shared t / interp
            // Per-axis ease: AE returns its own influence/speed for X vs Y. We keep BOTH
            // by storing arrays; the Figma side reads easeIn/easeOut[axis].
            out.push({
                t: base.t,
                value: [a ? a.value[0] : 0, b ? b.value[0] : 0, 0],
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
            return {
                value: td.text,
                fontSize: round(td.fontSize),
                font: td.font,
                color: color(td.fillColor),
                justification: td.justification
            };
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
            return { size: size, fill: fill, stroke: stroke, cornerRadius: cornerRadius };
        } catch (e) {}
        return { size: size, fill: fill, stroke: null, cornerRadius: cornerRadius };
    }

    // Return the first ENABLED fill color and the first ENABLED stroke (color + width).
    // A disabled paint (the eyeball off / "no fill") must NOT be exported — AE keeps the
    // color value even when the paint is off, so we gate on `enabled`.
    function firstPaints(group) {
        var result = { fill: null, stroke: null };
        function walk(g) {
            if (!g) return;
            for (var i = 1; i <= g.numProperties; i++) {
                var pr = g.property(i);
                try {
                    if (pr.matchName === "ADBE Vector Graphic - Fill" && result.fill === null && pr.enabled) {
                        result.fill = color(pr.property("ADBE Vector Fill Color").value);
                    } else if (pr.matchName === "ADBE Vector Graphic - Stroke" && result.stroke === null && pr.enabled) {
                        result.stroke = {
                            color: color(pr.property("ADBE Vector Stroke Color").value),
                            width: round(pr.property("ADBE Vector Stroke Width").value)
                        };
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
        if (layer.source && layer.source.mainSource instanceof SolidSource) return "solid";
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

    // --- walk layers ------------------------------------------------------

    plog("comp '" + comp.name + "' has " + comp.numLayers + " layers");
    var layers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        var type = layerType(L);
        plog("layer " + i + " '" + L.name + "' type=" + type);
        if (type === "other") continue; // skip cameras, lights, adjustment-only, nulls-without-children for v1

        // sourceRect = the layer's content bounds in its OWN coordinate space.
        // Critical for placement: AE's anchor/position are relative to this origin,
        // and content rarely starts at (0,0) - text especially has a non-zero top.
        var sr = null;
        try {
            var r = L.sourceRectAtTime(0, false);
            sr = [round(r.left), round(r.top), round(r.width), round(r.height)];
        } catch (e) {}

        var entry = {
            index: L.index,
            name: L.name,
            type: type,
            parentIndex: L.parent ? L.parent.index : null,
            inPoint: round(L.inPoint),
            outPoint: round(L.outPoint),
            sourceRect: sr, // [left, top, width, height] in layer space
            transform: transform(L)
        };

        if (type === "text") entry.text = textInfo(L);
        else if (type === "solid") entry.solid = solidInfo(L);
        else if (type === "shape") entry.shape = shapeInfo(L);
        else if (type === "image") {
            entry.image = imageInfo(L);
            if (!entry.image) continue; // unreadable source -> skip rather than emit a broken layer
        }

        layers.push(entry);
    }

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

    win.layout.layout(true);
    if (win instanceof Window) { win.center(); win.show(); }
})(this);
