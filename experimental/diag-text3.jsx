// Extract what a per-character split needs: the text string, the Type Array effect
// timing params, and the animator Position delta sampled via the expression's model.
(function () {
    var comp = app.project.activeItem;
    var L = comp.selectedLayers[0];
    var out = []; function w(s){ out.push(s); }
    function es(e){ try { return String(e.toString()); } catch(x){ return "(err)"; } }

    var td = L.property("ADBE Text Properties").property("ADBE Text Document").value;
    w("text: '" + td.text + "'  len=" + td.text.length);
    w("fontSize: " + td.fontSize + "  font: " + td.font);

    // The "Type Array" effect drives the timing. Dump its params E(1)..E(5).
    w("--- Type Array effect params ---");
    try {
        var fx = L.property("ADBE Effect Parade");
        for (var e = 1; e <= fx.numProperties; e++) {
            var ef = fx.property(e);
            w("effect: [" + ef.matchName + "] '" + ef.name + "'");
            for (var p = 1; p <= ef.numProperties; p++) {
                var pp = ef.property(p);
                var v; try { v = pp.value; } catch (x) { v = es(x); }
                var nk=0; try{nk=pp.numKeys;}catch(x){}
                w("    (" + p + ") '" + pp.name + "' = " + v + (nk?(" numKeys="+nk):""));
                for (var k=1;k<=nk;k++){ try{ w("        key"+k+" t="+pp.keyTime(k)+" v="+pp.keyValue(k)); }catch(x){} }
            }
        }
    } catch (e) { w("  effects ERR: " + es(e)); }

    // The animator Position delta MAGNITUDE: read it by temporarily... no, just report
    // its static value via each component (it errored on .value as a 3D array).
    w("--- animator Position delta (per-component) ---");
    try {
        var pos = L.property("ADBE Text Properties").property("ADBE Text Animators").property(1)
                   .property("ADBE Text Animator Properties").property("ADBE Text Position 3D");
        var comps = [];
        for (var c=0;c<3;c++){ try{ comps.push(pos.value[c]); }catch(x){ comps.push("?"); } }
        w("  position delta = [" + comps.join(", ") + "]");
    } catch (e) { w("  pos ERR: " + es(e)); }

    var f = new File(Folder.temp.fsName + "/ae-text-diag3.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
