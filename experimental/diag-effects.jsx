// Dump a layer's effects (esp. Drop Shadow) property names + values, and a text layer's
// full TextDocument fields, so we can map them precisely. Select a layer that has a Drop
// Shadow (and/or is a text layer). Writes %TEMP%/ae-effects.txt.
(function () {
    var comp = app.project.activeItem;
    var L = comp.selectedLayers[0];
    var out = []; function w(s){ out.push(s); }
    function es(e){ try { return String(e.toString()); } catch(x){ return "(err)"; } }

    w("layer: " + L.name + "  matchName=" + L.matchName);

    // Effects
    try {
        var fx = L.property("ADBE Effect Parade");
        w("effects: " + fx.numProperties);
        for (var e=1;e<=fx.numProperties;e++){
            var ef = fx.property(e);
            w("  [" + ef.matchName + "] '" + ef.name + "' enabled=" + ef.enabled);
            for (var p=1;p<=ef.numProperties;p++){
                var pp = ef.property(p);
                var v; try { v = String(pp.value); } catch(x){ v = es(x); }
                w("      (" + p + ") [" + pp.matchName + "] '" + pp.name + "' = " + v);
            }
        }
    } catch(e){ w("effects ERR: " + es(e)); }

    // Text document (if text layer)
    try {
        var td = L.property("ADBE Text Properties").property("ADBE Text Document").value;
        w("--- TextDocument ---");
        function tf(name, fn){ try { w("  " + name + " = " + fn()); } catch(e){ w("  " + name + " ERR " + es(e)); } }
        tf("text", function(){ return JSON.stringify(td.text); });
        tf("fontSize", function(){ return td.fontSize; });
        tf("font", function(){ return td.font; });
        tf("fontFamily", function(){ return td.fontFamily; });
        tf("fontStyle", function(){ return td.fontStyle; });
        tf("justification", function(){ return td.justification; });
        tf("tracking", function(){ return td.tracking; });
        tf("leading", function(){ return td.leading; });
        tf("autoLeading", function(){ return td.autoLeading; });
        tf("applyFill", function(){ return td.applyFill; });
        tf("fillColor", function(){ return td.fillColor; });
        tf("applyStroke", function(){ return td.applyStroke; });
        tf("strokeColor", function(){ return td.strokeColor; });
        tf("strokeWidth", function(){ return td.strokeWidth; });
        tf("boxText", function(){ return td.boxText; });
        tf("boxTextSize", function(){ return td.boxTextSize; });
    } catch(e){ w("textdoc: (not a text layer or ERR " + es(e) + ")"); }

    var f = new File(Folder.temp.fsName + "/ae-effects.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
