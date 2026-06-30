// Diagnostic: dump everything AE scripting exposes about the ease on the selected
// layer's Position keyframes. Run with a comp open and ONE layer selected.
// Writes to %TEMP%/ae-ease-diag.txt — paste that back.
(function () {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) { alert("Open a comp."); return; }
    var sel = comp.selectedLayers;
    if (!sel.length) { alert("Select the animated layer."); return; }
    var L = sel[0];

    var out = [];
    function w(s) { out.push(s); }
    // Concatenating an Error object throws in ExtendScript; extract its message safely.
    function errStr(e) { try { return String(e.toString()); } catch (x) { return "(err)"; } }

    w("layer: " + L.name);
    var tg = L.property("ADBE Transform Group");

    // Try Position, Separated X/Y, and report dimensionsSeparated.
    function dumpProp(label, prop) {
        if (!prop) { w(label + ": (not found)"); return; }
        w("=== " + label + " ===");
        try { w("  numKeys: " + prop.numKeys); } catch (e) { w("  numKeys ERR: " + errStr(e)); }
        try { w("  value: " + prop.value); } catch (e) { w("  value ERR: " + errStr(e)); }
        try { w("  dimensionsSeparated: " + prop.dimensionsSeparated); } catch (e) {}
        var nk = 0; try { nk = prop.numKeys; } catch (e) {}
        for (var i = 1; i <= nk; i++) {
            try { w("  --- key " + i + " (t=" + prop.keyTime(i) + ") ---"); } catch (e) { w("  --- key " + i + " ---"); }
            try { w("    keyValue: " + prop.keyValue(i)); } catch (e) { w("    keyValue ERR: " + errStr(e)); }
            try {
                var it = prop.keyInTemporalEase(i);
                for (var a = 0; a < it.length; a++)
                    w("    keyInTemporalEase[" + a + "]: influence=" + it[a].influence + " speed=" + it[a].speed);
            } catch (e) { w("    keyInTemporalEase ERR: " + errStr(e)); }
            try {
                var ot = prop.keyOutTemporalEase(i);
                for (var b = 0; b < ot.length; b++)
                    w("    keyOutTemporalEase[" + b + "]: influence=" + ot[b].influence + " speed=" + ot[b].speed);
            } catch (e) { w("    keyOutTemporalEase ERR: " + errStr(e)); }
            try { w("    inInterp: " + prop.keyInInterpolationType(i) + " outInterp: " + prop.keyOutInterpolationType(i)); } catch (e) {}
            try { w("    inSpatialTangent: " + prop.keyInSpatialTangent(i)); } catch (e) {}
            try { w("    outSpatialTangent: " + prop.keyOutSpatialTangent(i)); } catch (e) {}
            try { w("    roving: " + prop.keyRoving(i)); } catch (e) {}
        }
    }

    dumpProp("Position", tg.property("ADBE Position"));
    // If separated, also dump the X/Y sub-props.
    try {
        var pos = tg.property("ADBE Position");
        if (pos.dimensionsSeparated) {
            dumpProp("Position X", tg.property("ADBE Position_0"));
            dumpProp("Position Y", tg.property("ADBE Position_1"));
        }
    } catch (e) {}

    var f = new File(Folder.temp.fsName + "/ae-ease-diag.txt");
    f.encoding = "UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
