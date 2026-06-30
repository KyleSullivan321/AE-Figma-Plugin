// Diagnostic: dump a text layer's animator + range-selector structure so we can see
// exactly what ExtendScript exposes. Open comp, select the animated TEXT layer, run.
// Writes %TEMP%/ae-text-diag.txt — paste it back.
(function () {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) { alert("Open a comp."); return; }
    var sel = comp.selectedLayers;
    if (!sel.length) { alert("Select the text layer."); return; }
    var L = sel[0];

    var out = [];
    function w(s) { out.push(s); }
    function errStr(e) { try { return String(e.toString()); } catch (x) { return "(err)"; } }

    // Read a leaf value safely; for array props that throw on .value, read per index.
    function safeVal(prop) {
        try { return String(prop.value); }
        catch (e) {
            // Try reading components individually (3D position etc.)
            var parts = [];
            for (var k = 0; k < 4; k++) {
                try { parts.push(prop.value[k]); } catch (x) { break; }
            }
            return parts.length ? "[" + parts.join(",") + "]" : "(" + errStr(e) + ")";
        }
    }

    // Dump keyframes of a leaf prop if any.
    function dumpKeys(prop, pad) {
        var nk = 0; try { nk = prop.numKeys; } catch (e) {}
        for (var i = 1; i <= nk; i++) {
            var kl = pad + "  KEY " + i + " t=";
            try { kl += prop.keyTime(i); } catch (e) {}
            try { kl += " val=" + prop.keyValue(i); } catch (e) { kl += " val=(err)"; }
            w(kl);
        }
    }

    // Recursively dump a property tree: matchName, name, value (if leaf), keyframes.
    function dump(prop, depth) {
        var pad = "";
        for (var d = 0; d < depth; d++) pad += "  ";
        var n = 0, isGroup = false;
        try { n = prop.numProperties; isGroup = true; } catch (e) { isGroup = false; }

        if (!isGroup) {
            var nk = 0; try { nk = prop.numKeys; } catch (e) {}
            var val = safeVal(prop);
            // Skip noise: unkeyed leaves whose value is a plain 0 / 100 default.
            if (nk === 0 && (val === "0" || val === "100" || val === "1" || val === "50")) return;
            var line = pad + "[" + prop.matchName + "] '" + prop.name + "' value=" + val;
            if (nk > 0) line += " numKeys=" + nk;
            w(line);
            dumpKeys(prop, pad);
            return;
        }
        w(pad + "[" + prop.matchName + "] '" + prop.name + "'");
        for (var i = 1; i <= n; i++) {
            try { dump(prop.property(i), depth + 1); } catch (e) { w(pad + "  child ERR: " + errStr(e)); }
        }
    }

    w("layer: " + L.name + "  (matchName " + L.matchName + ")");
    try {
        var textProps = L.property("ADBE Text Properties");
        // The animators group lives under Text Properties.
        var animators = textProps.property("ADBE Text Animators");
        w("=== Animators (" + animators.numProperties + ") ===");
        dump(animators, 0);
    } catch (e) {
        w("animators ERR: " + errStr(e));
    }

    var f = new File(Folder.temp.fsName + "/ae-text-diag.txt");
    f.encoding = "UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
