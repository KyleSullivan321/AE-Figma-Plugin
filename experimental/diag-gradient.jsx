// Dump a shape's fill/stroke paint types + gradient data. Select a shape layer with a
// gradient fill or stroke, run. Writes %TEMP%/ae-gradient.txt.
(function () {
    var comp = app.project.activeItem;
    var L = comp.selectedLayers[0];
    var out = []; function w(s){ out.push(s); }
    function es(e){ try { return String(e.toString()); } catch(x){ return "(err)"; } }
    function safe(p){ try { return String(p.value); } catch(e){ return es(e); } }

    w("layer: " + L.name);

    function walk(group, depth) {
        var pad=""; for(var d=0;d<depth;d++) pad+="  ";
        for (var i=1;i<=group.numProperties;i++){
            var pr = group.property(i);
            var en=""; try { en = " enabled="+pr.enabled; } catch(e){}
            w(pad + "[" + pr.matchName + "] '" + pr.name + "'" + en);
            // For any fill/stroke (solid OR gradient), dump ALL child props + values.
            var mn = pr.matchName;
            if (mn.indexOf("Fill") !== -1 || mn.indexOf("Stroke") !== -1) {
                for (var j=1;j<=pr.numProperties;j++){
                    var sub = pr.property(j);
                    w(pad + "    <" + sub.matchName + "> '" + sub.name + "' = " + safe(sub));
                }
            }
            try { if (pr.property("ADBE Vectors Group")) walk(pr.property("ADBE Vectors Group"), depth+1); } catch(e){}
        }
    }
    try { walk(L.property("ADBE Root Vectors Group"), 0); } catch(e){ w("walk ERR " + es(e)); }

    var f = new File(Folder.temp.fsName + "/ae-gradient.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
