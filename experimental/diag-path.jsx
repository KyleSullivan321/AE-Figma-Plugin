// Dump a shape layer's freeform bezier path data (vertices, tangents, closed) so we can
// build an AE-path -> SVG -> Figma-vector converter. Select a shape layer that has a
// custom/pen path (not a plain rect/ellipse). Writes %TEMP%/ae-path.txt.
(function () {
    var comp = app.project.activeItem;
    var L = comp.selectedLayers[0];
    var out = []; function w(s){ out.push(s); }
    function es(e){ try { return String(e.toString()); } catch(x){ return "(err)"; } }

    w("layer: " + L.name);
    try {
        var r = L.sourceRectAtTime(0, false);
        w("sourceRect: left=" + r.left + " top=" + r.top + " w=" + r.width + " h=" + r.height);
    } catch(e){ w("sourceRect ERR " + es(e)); }

    // Find every path property (ADBE Vector Shape) in the shape tree. Recurse into BOTH
    // "ADBE Vectors Group" (contents) and "ADBE Vector Shape - Group" (a Path container).
    var pathCount = 0, trimCount = 0;
    function walk(group, depth) {
        var pad=""; for(var d=0;d<depth;d++) pad+="  ";
        for (var i=1;i<=group.numProperties;i++){
            var pr = group.property(i);
            w(pad + "[" + pr.matchName + "] '" + pr.name + "'");
            if (pr.matchName === "ADBE Vector Shape") {
                pathCount++;
                try {
                    var sh = pr.value;   // a Shape object
                    w(pad + "  closed: " + sh.closed);
                    w(pad + "  vertices (" + sh.vertices.length + "):");
                    for (var v=0; v<sh.vertices.length; v++) {
                        w(pad + "    v" + v + " = [" + sh.vertices[v][0] + ", " + sh.vertices[v][1] + "]"
                            + "  in=[" + sh.inTangents[v][0] + ", " + sh.inTangents[v][1] + "]"
                            + "  out=[" + sh.outTangents[v][0] + ", " + sh.outTangents[v][1] + "]");
                    }
                } catch(e){ w(pad + "  shape read ERR: " + es(e)); }
            }
            // Trim Paths modifier: dump start/end/offset + keyframes (the write-on anim).
            if (pr.matchName === "ADBE Vector Filter - Trim") {
                trimCount++;
                var names = ["ADBE Vector Trim Start", "ADBE Vector Trim End", "ADBE Vector Trim Offset"];
                for (var t=0;t<names.length;t++){
                    try {
                        var tp = pr.property(names[t]);
                        var line = pad + "  " + tp.name + " = " + tp.value + " numKeys=" + tp.numKeys;
                        w(line);
                        for (var k=1;k<=tp.numKeys;k++) w(pad + "    key" + k + " t=" + tp.keyTime(k) + " v=" + tp.keyValue(k));
                    } catch(e){ w(pad + "  trim prop ERR: " + es(e)); }
                }
            }
            try { if (pr.property("ADBE Vectors Group")) walk(pr.property("ADBE Vectors Group"), depth+1); } catch(e){}
            // ADBE Vector Shape - Group is the Path container; its child is the shape.
            if (pr.matchName === "ADBE Vector Shape - Group") {
                try { walk(pr, depth+1); } catch(e){ w(pad + "  path-group recurse ERR: " + es(e)); }
            }
        }
    }
    try { walk(L.property("ADBE Root Vectors Group"), 0); } catch(e){ w("walk ERR " + es(e)); }
    w("total paths: " + pathCount + "  trims: " + trimCount);

    var f = new File(Folder.temp.fsName + "/ae-path.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
