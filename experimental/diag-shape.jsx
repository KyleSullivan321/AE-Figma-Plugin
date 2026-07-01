// Dump a shape layer's rect path (position, size, roundness) + the layer scale,
// to find where per-square offset lives. Select ONE shape layer, run.
(function () {
    var comp = app.project.activeItem;
    var L = comp.selectedLayers[0];
    var out = []; function w(s){ out.push(s); }
    function es(e){ try { return String(e.toString()); } catch(x){ return "(err)"; } }

    w("layer: " + L.name);
    var tg = L.property("ADBE Transform Group");
    function tv(nm){ try { return String(tg.property(nm).value); } catch(e){ return es(e); } }
    w("  layer Position: " + tv("ADBE Position"));
    w("  layer Anchor:   " + tv("ADBE Anchor Point"));
    w("  layer Scale:    " + tv("ADBE Scale"));
    // If scale is separated, read the sub-props.
    try { w("  scale dimsSeparated: " + tg.property("ADBE Scale").dimensionsSeparated); } catch(e){ w("  scale dimsSep ERR " + es(e)); }
    try { w("  Scale_0 (X): " + tg.property("ADBE Scale_0").value); } catch(e){}
    try { w("  Scale_1 (Y): " + tg.property("ADBE Scale_1").value); } catch(e){}
    try { w("  pos dimsSeparated: " + tg.property("ADBE Position").dimensionsSeparated); } catch(e){}

    // Walk the vector tree for rect path props.
    function walk(group, depth) {
        var pad=""; for(var d=0;d<depth;d++) pad+="  ";
        for (var i=1;i<=group.numProperties;i++){
            var pr = group.property(i);
            w(pad + "[" + pr.matchName + "] '" + pr.name + "'");
            if (pr.matchName === "ADBE Vector Shape - Rect") {
                try { w(pad + "  Size: " + pr.property("ADBE Vector Rect Size").value); } catch(e){ w(pad+"  Size ERR "+es(e)); }
                try { w(pad + "  Position: " + pr.property("ADBE Vector Rect Position").value); } catch(e){ w(pad+"  Pos ERR "+es(e)); }
                try { w(pad + "  Roundness: " + pr.property("ADBE Vector Rect Roundness").value); } catch(e){ w(pad+"  Round ERR "+es(e)); }
            }
            // group transform (a shape group can have its own Position/Scale)
            if (pr.matchName === "ADBE Vector Group") {
                try {
                    var tr = pr.property("ADBE Vector Transform Group");
                    w(pad + "  group Position: " + tr.property("ADBE Vector Position").value);
                    w(pad + "  group Anchor:   " + tr.property("ADBE Vector Anchor").value);
                    w(pad + "  group Scale:    " + tr.property("ADBE Vector Scale").value);
                } catch(e){ w(pad+"  groupT ERR "+es(e)); }
            }
            try { if (pr.property("ADBE Vectors Group")) walk(pr.property("ADBE Vectors Group"), depth+1); } catch(e){}
        }
    }
    try { walk(L.property("ADBE Root Vectors Group"), 0); } catch(e){ w("walk ERR " + es(e)); }

    var f = new File(Folder.temp.fsName + "/ae-shape-diag.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
