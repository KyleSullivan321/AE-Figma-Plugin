// Split an animated text layer into one text layer per character, with BAKED Position
// keyframes that reproduce the per-character stagger. Then run ae-export.jsx as usual —
// the split layers export as ordinary keyframed text.
//
// Built for "Type Array V2" animators (expression-driven, unreadable per-char via the
// API). Reads the Type Array effect's timing and the animator's Position delta, then
// computes each character's animation directly. ponytail: handles the Position case the
// user has; other Type Array properties (opacity/scale) can be added the same way.
//
// Run: open comp, select the animated text layer, File > Scripts > Run Script File.
(function () {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) { alert("Open a comp."); return; }
    var sel = comp.selectedLayers;
    if (!sel.length || !(sel[0] instanceof TextLayer)) { alert("Select a text layer."); return; }
    var src = sel[0];
    var fps = comp.frameRate;

    // --- read the Type Array timing + animator position delta ---------------
    function findTypeArray() {
        try {
            var fx = src.property("ADBE Effect Parade");
            for (var e = 1; e <= fx.numProperties; e++) {
                var ef = fx.property(e);
                if (ef.matchName.indexOf("Type Array") !== -1 || ef.name === "Type Array") return ef;
            }
        } catch (x) {}
        return null;
    }
    var ta = findTypeArray();
    if (!ta) { alert("No 'Type Array' effect found on this layer."); return; }

    function eVal(i) { try { return ta.property(i).value; } catch (x) { return null; } }
    var influenceProp = ta.property(1);           // 'Influence' (keyframed 100->0)
    var delayFrames   = eVal(2) || 0;             // per-index delay
    var shiftFrames   = eVal(3) || 0;
    var reverse       = eVal(5) ? true : false;

    // Influence keyframes define the per-char animation window + curve.
    var infKeys = [];
    try {
        for (var k = 1; k <= influenceProp.numKeys; k++) {
            infKeys.push({ t: influenceProp.keyTime(k), v: influenceProp.keyValue(k) });
        }
    } catch (x) {}
    if (infKeys.length < 2) { alert("Type Array 'Influence' needs 2+ keyframes."); return; }
    var animStart = infKeys[0].t;
    var animEnd = infKeys[infKeys.length - 1].t;

    // Animator Position delta [x,y,z] — the offset at influence=100.
    var posDelta = [0, 0, 0];
    try {
        var pd = src.property("ADBE Text Properties").property("ADBE Text Animators").property(1)
                    .property("ADBE Text Animator Properties").property("ADBE Text Position 3D");
        for (var c = 0; c < 3; c++) posDelta[c] = pd.value[c];
    } catch (x) {}

    // --- text + per-character x positions -----------------------------------
    var td = src.property("ADBE Text Properties").property("ADBE Text Document").value;
    var str = td.text;
    var n = str.length;

    // Base layer position/anchor (where the text sits).
    var tg = src.property("ADBE Transform Group");
    var basePos = tg.property("ADBE Position").value;       // [x,y] of the text layer
    var baseAnchor = tg.property("ADBE Anchor Point").value;

    // Measure each character's x offset by building a probe text layer and reading its
    // width as we append characters. cumulativeWidth[i] = x where char i starts.
    function makeProbe(s) {
        var pl = comp.layers.addText(s);
        var doc = pl.property("ADBE Text Properties").property("ADBE Text Document").value;
        doc.resetCharStyle();
        doc.fontSize = td.fontSize;
        try { doc.font = td.font; } catch (e) {}
        pl.property("ADBE Text Properties").property("ADBE Text Document").setValue(doc);
        return pl;
    }
    var widths = [];   // width of the string up to and including char i
    for (var i = 0; i < n; i++) {
        var probe = makeProbe(str.substring(0, i + 1));
        var r = probe.sourceRectAtTime(0, false);
        widths.push(r.width);
        probe.remove();
    }
    function charX(i) { return (i === 0) ? 0 : widths[i - 1]; }  // left edge of char i

    // --- build one text layer per character ---------------------------------
    app.beginUndoGroup("Split text for Figma export");

    var created = [];
    for (var ci = 0; ci < n; ci++) {
        var ch = str.charAt(ci);
        if (ch === " ") continue; // skip spaces (no glyph to animate)

        var cl = comp.layers.addText(ch);
        cl.name = src.name + " [" + ci + "] '" + ch + "'";
        var cdoc = cl.property("ADBE Text Properties").property("ADBE Text Document").value;
        cdoc.resetCharStyle();
        cdoc.fontSize = td.fontSize;
        try { cdoc.font = td.font; } catch (e) {}
        try { cdoc.fillColor = td.fillColor; } catch (e) {}
        try { cdoc.justification = ParagraphJustification.LEFT_JUSTIFY; } catch (e) {}
        cl.property("ADBE Text Properties").property("ADBE Text Document").setValue(cdoc);

        // Resting position: base layer pos, shifted right by this char's x.
        var ctg = cl.property("ADBE Transform Group");
        var restX = basePos[0] - baseAnchor[0] + charX(ci);
        var restY = basePos[1];
        var posProp = ctg.property("ADBE Position");

        // Per-character animation timing (Type Array model):
        //   delay = index * delayFrames  (reversed if Reverse on)
        //   over [animStart, animEnd], Y offset = posDelta.y * (influence/100)
        var idx = reverse ? (n - 1 - ci) : ci;
        var delay = (idx * delayFrames + shiftFrames) / fps;

        // Bake a position keyframe per Influence keyframe, mapping influence->offset.
        for (var ik = 0; ik < infKeys.length; ik++) {
            var t = infKeys[ik].t + delay;
            var inf = infKeys[ik].v / 100;               // 1 at start, 0 at rest
            var ox = posDelta[0] * inf;
            var oy = posDelta[1] * inf;
            posProp.setValueAtTime(t, [restX + ox, restY + oy]);
        }
        // Hold rest after the last keyframe is implicit; AE holds last value.

        created.push(cl);
    }

    // Hide the original so it doesn't double up. (Don't delete — user may want it back.)
    src.enabled = false;

    app.endUndoGroup();
    alert("Split '" + src.name + "' into " + created.length + " character layers.\n" +
          "The original was hidden (not deleted). Now run ae-export.jsx.");
})();
