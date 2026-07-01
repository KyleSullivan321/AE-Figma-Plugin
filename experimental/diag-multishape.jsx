// Dump the structure of a shape layer that has MULTIPLE shapes (e.g. two rectangles, or a
// rect + ellipse) so we can export all of them, not just the first. Select the layer, run.
// Writes %TEMP%/ae-multishape.txt.
(function () {
    var comp = app.project.activeItem;
    var L = comp.selectedLayers[0];
    var out = []; function w(s){ out.push(s); }
    function es(e){ try { return String(e.toString()); } catch(x){ return "(err)"; } }
    function safe(p){ try { return String(p.value); } catch(e){ return es(e); } }

    w("layer: " + L.name);
    // Walk the root vectors group; report each top-level group and its transform + contents.
    function walk(group, depth) {
        var pad=""; for(var d=0;d<depth;d++) pad+="  ";
        for (var i=1;i<=group.numProperties;i++){
            var pr = group.property(i);
            w(pad + "[" + pr.matchName + "] '" + pr.name + "'");
            // A shape group's own transform (position/scale/rotation within the layer).
            if (pr.matchName === "ADBE Vector Group") {
                try {
                    var tg = pr.property("ADBE Vector Transform Group");
                    w(pad + "  T: pos=" + safe(tg.property("ADBE Vector Position"))
                        + " anchor=" + safe(tg.property("ADBE Vector Anchor"))
                        + " scale=" + safe(tg.property("ADBE Vector Scale"))
                        + " rot=" + safe(tg.property("ADBE Vector Rotation"))
                        + " op=" + safe(tg.property("ADBE Vector Group Opacity")));
                } catch(e){ w(pad + "  T ERR " + es(e)); }
            }
            // Rect/ellipse size+position.
            if (pr.matchName === "ADBE Vector Shape - Rect" || pr.matchName === "ADBE Vector Shape - Ellipse") {
                try { w(pad + "  Size=" + safe(pr.property("ADBE Vector Rect Size")) + " Pos=" + safe(pr.property("ADBE Vector Rect Position"))); } catch(e){}
            }
            try { if (pr.property("ADBE Vectors Group")) walk(pr.property("ADBE Vectors Group"), depth+1); } catch(e){}
        }
    }
    try { walk(L.property("ADBE Root Vectors Group"), 0); } catch(e){ w("walk ERR " + es(e)); }

    var f = new File(Folder.temp.fsName + "/ae-multishape.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
