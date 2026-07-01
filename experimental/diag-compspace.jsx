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
        // Map the rect's top-left (layer space) into comp space.
        // sourcePointToComp takes a [x,y] in layer coordinates.
        try {
            var tl = L.sourcePointToComp([r.left, r.top]);
            var br = L.sourcePointToComp([r.left + r.width, r.top + r.height]);
            w("  compSpace TL: [" + tl[0] + ", " + tl[1] + "]");
            w("  compSpace BR: [" + br[0] + ", " + br[1] + "]");
        } catch(e){ w("  sourcePointToComp ERR "+es(e)); }
    }

    var f = new File(Folder.temp.fsName + "/ae-compspace.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
