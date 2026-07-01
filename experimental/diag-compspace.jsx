// For EACH shape layer, compute its rendered top-left in COMPOSITION space by mapping
// the layer-space sourceRect corner through the layer transform. This is what actually
// distinguishes shapes whose offset lives in an unreadable rect path.
// Select nothing (dumps all shape layers). Writes %TEMP%/ae-compspace.txt.
(function () {
    var comp = app.project.activeItem;
    var out = []; function w(s){ out.push(s); }
    function es(e){ try { return String(e.toString()); } catch(x){ return "(err)"; } }

    for (var li = 1; li <= comp.numLayers; li++) {
        var L = comp.layer(li);
        if (!(L instanceof ShapeLayer)) continue;
        w("=== " + L.name + " ===");
        // layer-space content rect
        var r;
        try { r = L.sourceRectAtTime(0, false); w("  sourceRect(L): top="+r.top+" left="+r.left+" w="+r.width+" h="+r.height); }
        catch(e){ w("  sourceRect ERR "+es(e)); continue; }
        // rotation + position for context
        try {
            var tg = L.property("ADBE Transform Group");
            w("  rotation: " + tg.property("ADBE Rotate Z").value);
            w("  position: " + tg.property("ADBE Position").value);
            w("  anchor: " + tg.property("ADBE Anchor Point").value);
        } catch(e){ w("  transform read ERR " + es(e)); }
        // Map ALL FOUR corners into comp space (rotation-safe bounding box).
        try {
            var c = [
                L.sourcePointToComp([r.left, r.top]),
                L.sourcePointToComp([r.left + r.width, r.top]),
                L.sourcePointToComp([r.left + r.width, r.top + r.height]),
                L.sourcePointToComp([r.left, r.top + r.height])
            ];
            for (var k = 0; k < 4; k++) w("  corner" + k + ": [" + c[k][0].toFixed(1) + ", " + c[k][1].toFixed(1) + "]");
            var xs = [c[0][0],c[1][0],c[2][0],c[3][0]], ys = [c[0][1],c[1][1],c[2][1],c[3][1]];
            var minX = Math.min.apply(null,xs), minY = Math.min.apply(null,ys);
            var maxX = Math.max.apply(null,xs), maxY = Math.max.apply(null,ys);
            w("  BBOX comp: x=" + minX.toFixed(1) + " y=" + minY.toFixed(1) + " w=" + (maxX-minX).toFixed(1) + " h=" + (maxY-minY).toFixed(1));
        } catch(e){ w("  sourcePointToComp ERR "+es(e)); }
    }

    var f = new File(Folder.temp.fsName + "/ae-compspace.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
