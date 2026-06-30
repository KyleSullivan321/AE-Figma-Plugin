// Targeted: read the animator's Position + the selector's Amount/expression directly,
// at a few times, to see if motion comes from an expression vs keyframes.
(function () {
    var comp = app.project.activeItem;
    var L = comp.selectedLayers[0];
    var out = [];
    function w(s){ out.push(s); }
    function es(e){ try { return String(e.toString()); } catch(x){ return "(err)"; } }

    var anim = L.property("ADBE Text Properties").property("ADBE Text Animators").property(1);
    var sel  = anim.property("ADBE Text Selectors").property(1);
    var props = anim.property("ADBE Text Animator Properties");
    var pos  = props.property("ADBE Text Position 3D");
    var amt  = sel.property("ADBE Text Expressible Amount");
    var basedOn = sel.property("ADBE Text Range Type2");

    w("selector matchName: " + sel.matchName + "  name: " + sel.name);
    w("Based On value: " + (function(){ try { return basedOn.value; } catch(e){ return es(e); } })());

    // Amount: expression?
    w("--- Amount ---");
    try { w("  canSetExpression: " + amt.canSetExpression); } catch(e){}
    try { w("  expressionEnabled: " + amt.expressionEnabled); } catch(e){ w("  expEnabled ERR "+es(e)); }
    try { w("  expression: " + amt.expression); } catch(e){ w("  expr ERR "+es(e)); }
    try { w("  numKeys: " + amt.numKeys + "  value: " + amt.value); } catch(e){ w("  amt val ERR "+es(e)); }

    // Position delta: value over time + keyframes + expression
    w("--- Position (animator delta) ---");
    try { w("  numKeys: " + pos.numKeys); } catch(e){ w("  numKeys ERR "+es(e)); }
    try { w("  expressionEnabled: " + pos.expressionEnabled); } catch(e){}
    try { w("  expression: " + pos.expression); } catch(e){}
    // sample the value at several comp times
    for (var t = 0; t <= comp.duration + 0.001; t += comp.duration/4) {
        try { w("  valueAtTime(" + t.toFixed(2) + "): " + pos.valueAtTime(t, false)); }
        catch(e){ w("  valueAtTime(" + t.toFixed(2) + ") ERR: " + es(e)); }
    }
    // also dump keyframes if any
    var nk=0; try{ nk=pos.numKeys; }catch(e){}
    for (var i=1;i<=nk;i++){ try{ w("  KEY "+i+" t="+pos.keyTime(i)+" val="+pos.keyValue(i)); }catch(e){} }

    // Is the layer's text itself keyed (source text)? and the layer in/out
    w("--- layer ---");
    w("  inPoint: " + L.inPoint + "  outPoint: " + L.outPoint);

    var f = new File(Folder.temp.fsName + "/ae-text-diag2.txt");
    f.encoding="UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    alert("Wrote " + f.fsName);
})();
