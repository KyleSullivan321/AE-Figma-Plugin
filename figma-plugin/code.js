// AE → Figma importer. Receives the comp JSON from ui.html, rebuilds layers,
// preserves parenting as nested frames, and applies keyframes via the Motion API.
//
// The Motion API is beta. Everything motion-specific is isolated in applyKeyframes()
// and the MOTION_PROP map below — the ONE place to adjust once enum names are
// confirmed against the live API. Static layer creation never depends on it, so a
// motion-API change/outage degrades to a clean static import, not a failed one.

figma.showUI(__html__, { width: 320, height: 360 });

var IMAGES = {}; // filename -> Uint8Array, provided by the UI per import

figma.ui.onmessage = async function (msg) {
  if (msg.type !== 'import') return;
  IMAGES = msg.images || {};
  try {
    await importComp(msg.data);
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: String(e && e.message || e) });
  }
};

function log(text) { figma.ui.postMessage({ type: 'log', text: text }); }

// --- Motion API mapping (verify against live beta API) ----------------------
// AE transform prop -> Figma keyframe field name(s). AE position/scale/anchor are
// 2D (x,y); Figma keyframes are per-axis, so those map to two fields.
// ponytail: names per docs example (TRANSLATION_X). Confirm the rest in a real file.
var MOTION_PROP = {
  position: ['TRANSLATION_X', 'TRANSLATION_Y'],
  scale:    ['SCALE_X', 'SCALE_Y'],
  rotation: ['ROTATION'],
  opacity:  ['OPACITY']
};

async function importComp(data) {
  if (!data || !data.comp || !data.layers) throw new Error('Bad payload');
  await figma.loadAllPagesAsync().catch(function () {}); // dynamic-page access

  var comp = data.comp;

  // Root frame = the composition. Everything imports inside it.
  var root = figma.createFrame();
  root.name = comp.name || 'AE Comp';
  root.resize(comp.width, comp.height);
  root.clipsContent = true;
  root.x = 0; root.y = 0;
  figma.currentPage.appendChild(root);

  // Build the parent/child hierarchy so an animated parent (a null-object rig) propagates
  // its motion to children, and recurse into precomps. AE parenting inherits
  // position/rotation/scale (NOT opacity); a PRECOMP inherits all of them plus opacity.
  // Each parent/precomp becomes a Figma FRAME centered on its anchor (so rotation/scale
  // pivot around the anchor, matching AE) carrying the transform; content + children nest.
  var motionOk = true;
  var count = 0;

  // Build one LAYER SET (the main layers, or a precomp's sub-layers) into `container`.
  // `origin` = comp-space top-left of the container's coordinate system (subtracted from
  // each layer's compBounds). For the root and for precomp frames it is [0,0] because those
  // layers' compBounds are already expressed in that frame's local space.
  async function buildLayerSet(layers, container, origin) {
    var byIndex = {}, kidsOf = {}, roots = [];
    layers.forEach(function (L) {
      byIndex[L.index] = L;
      if (L.shape && L.shape.pathBoundsComp) L.compBounds = L.shape.pathBoundsComp;
    });
    layers.forEach(function (L) {
      if (L.parentIndex != null && byIndex[L.parentIndex]) {
        (kidsOf[L.parentIndex] = kidsOf[L.parentIndex] || []).push(L);
      } else { roots.push(L); }
    });
    function isParent(L) { return !!(kidsOf[L.index] && kidsOf[L.index].length); }

    async function build(L, cont, orig) {
      count++;
      var isPre = L.type === 'precomp';
      var content = isPre ? null : await createNode(L);

      if (isParent(L) || isPre) {
        var tr = L.transform || {}, kf = tr.keyframes || {};
        // Frame size: a precomp is sized to its sub-composition; a plain parent to its
        // content bounds. Centered on the anchor so the rotation/scale pivot matches AE.
        var w, h;
        if (isPre && L.subComp) { w = Math.max(1, L.subComp.width); h = Math.max(1, L.subComp.height); }
        else { var cb0 = L.compBounds || [0, 0, 100, 100]; w = Math.max(1, cb0[2]); h = Math.max(1, cb0[3]); }
        var cb = L.compBounds || [0, 0, w, h];
        var anchor = L.anchorComp || [cb[0] + w / 2, cb[1] + h / 2];
        var frame = figma.createFrame();
        frame.name = L.name;
        frame.clipsContent = isPre ? true : false; // a precomp clips to its bounds like a comp
        frame.fills = [];
        frame.resize(w, h);
        var fx = anchor[0] - w / 2, fy = anchor[1] - h / 2;
        cont.appendChild(frame);
        frame.x = fx - orig[0];
        frame.y = fy - orig[1];

        // Transform goes on the frame. Precomp opacity DOES inherit (put it on the frame);
        // a plain parent's opacity does NOT (kept on its own content node below).
        if (tr.rotation != null && !(kf.rotation && kf.rotation.length)) frame.rotation = -tr.rotation[0];
        var props = isPre ? ['position', 'rotation', 'scale', 'opacity'] : ['position', 'rotation', 'scale'];
        if (isPre && tr.opacity != null && !(kf.opacity && kf.opacity.length)) frame.opacity = clamp01(tr.opacity[0] / 100);
        try { applyKeyframes(frame, L, comp, props); }
        catch (err) { motionOk = false; log('Motion skipped for "' + L.name + '": ' + (err && err.message || err)); }

        if (isPre) {
          applyEffects(frame, L); // precomp effect applies to the whole nested group
          // Recurse the sub-comp's layers into the frame. Their compBounds are in sub-comp
          // space, which equals the frame's local space, so origin is [0,0].
          await buildLayerSet(L.subLayers || [], frame, [0, 0]);
        } else {
          if (content) {
            frame.appendChild(content);
            content.x = cb[0] - fx;
            content.y = cb[1] - fy;
            var trOp = tr.opacity, animOp = kf.opacity && kf.opacity.length;
            if (trOp != null && !animOp) content.opacity = clamp01(trOp[0] / 100);
            try { applyKeyframes(content, L, comp, ['opacity']); } catch (e) {}
            applyTrim(content, L, comp);
            applyEffects(content, L);
          }
          var kids = kidsOf[L.index].slice().sort(function (a, b) { return b.index - a.index; });
          for (var i = 0; i < kids.length; i++) await build(kids[i], frame, [fx, fy]);
        }
      } else {
        if (!content) return;
        cont.appendChild(content);
        positionNode(content, L, comp, orig);
        try { applyKeyframes(content, L, comp); }
        catch (err) { motionOk = false; log('Motion skipped for "' + L.name + '": ' + (err && err.message || err)); }
        applyTrim(content, L, comp);
        applyEffects(content, L);
      }
    }

    var ordered = roots.slice().sort(function (a, b) { return b.index - a.index; });
    for (var r = 0; r < ordered.length; r++) await build(ordered[r], container, origin);
  }

  await buildLayerSet(data.layers, root, [0, 0]);

  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  figma.ui.postMessage({
    type: 'done',
    text: 'Imported ' + count + ' layers' + (motionOk ? '' : ' (some motion unavailable)')
  });
}

// --- node creation ----------------------------------------------------------

async function createNode(L) {
  if (L.type === 'text') return await createText(L);
  if (L.type === 'solid') return createSolid(L);
  if (L.type === 'shape') return createShape(L);
  if (L.type === 'image') return createImage(L);
  return null;
}

async function createText(L) {
  var node = figma.createText();
  var t = L.text || {};
  // Always have a loadable font; prefer AE's family+style, fall back to Inter.
  var font = await loadFontSafe(t.fontFamily || t.font, t.fontStyle);
  node.fontName = font;
  // AE stores line breaks as char 3 (ETX) or char 13 (CR), not newline - normalize.
  var chars = (t.value != null) ? String(t.value) : L.name;
  chars = chars.split(String.fromCharCode(3)).join('\n').split(String.fromCharCode(13)).join('\n');
  node.characters = chars;

  // Paragraph text (fixed box) vs point text (auto-size).
  if (t.boxSize && t.boxSize[0] > 0) {
    node.textAutoResize = 'HEIGHT';
    node.resize(t.boxSize[0], node.height);
  } else {
    node.textAutoResize = 'WIDTH_AND_HEIGHT';
  }

  if (t.fontSize) node.fontSize = t.fontSize;
  node.fills = t.color ? [solidPaint(t.color)] : [];
  if (t.stroke && t.stroke.color) {
    node.strokes = [solidPaint(t.stroke.color)];
    if (t.stroke.width) node.strokeWeight = t.stroke.width;
  }

  // Alignment: AE ParagraphJustification enum -> Figma textAlignHorizontal.
  // 7413=left, 7414=right, 7415=center (AE enum values).
  var j = t.justification;
  node.textAlignHorizontal = (j === 7414) ? 'RIGHT' : (j === 7415) ? 'CENTER' : 'LEFT';

  // Tracking (AE 1/1000 em) -> letter spacing in px at this font size.
  if (t.tracking) node.letterSpacing = { unit: 'PIXELS', value: (t.tracking / 1000) * (t.fontSize || node.fontSize) };
  // Leading (AE line height in px) -> Figma lineHeight.
  if (t.leading) node.lineHeight = { unit: 'PIXELS', value: t.leading };

  return node;
}

function createSolid(L) {
  var node = figma.createRectangle();
  var s = L.solid || {};
  var size = s.size || [100, 100];
  node.resize(size[0], size[1]);
  node.fills = [solidPaint(s.color || [0.5, 0.5, 0.5])];
  return node;
}

function createShape(L) {
  var s = L.shape || {};
  // Multiple shapes in one layer -> a frame holding each sub-shape at its own position.
  if (s.subShapes && s.subShapes.length > 1 && L.compBounds) {
    var lb = L.compBounds; // [x,y,w,h] layer bounds in comp space
    var frame = figma.createFrame();
    frame.name = L.name;
    frame.clipsContent = false;
    frame.fills = [];
    frame.resize(Math.max(1, lb[2]), Math.max(1, lb[3]));
    for (var i = 0; i < s.subShapes.length; i++) {
      var sub = s.subShapes[i];
      var cb = sub.compBounds || [lb[0], lb[1], 50, 50];
      var n = makeShapeNode(sub, [cb[2], cb[3]], L.name);
      frame.appendChild(n);
      if (n.type !== 'VECTOR') n.resize(Math.max(1, cb[2]), Math.max(1, cb[3]));
      n.x = cb[0] - lb[0];
      n.y = cb[1] - lb[1];
    }
    return frame;
  }
  var size = s.size || [100, 100];
  return makeShapeNode(s, [Math.max(1, size[0]), Math.max(1, size[1])], L.name);
}

// Build one shape node (rect/ellipse/star/polygon/vector) from a shape descriptor.
function makeShapeNode(s, size, name) {
  var w = Math.max(1, size[0]), h = Math.max(1, size[1]);
  var kind = s.shapeKind || 'rect';
  var node;
  if (kind === 'ellipse') {
    node = figma.createEllipse(); node.resize(w, h);
  } else if (kind === 'star') {
    node = figma.createStar();
    if (s.points) node.pointCount = Math.max(3, s.points);
    if (s.innerRatio != null) node.innerRadius = clamp01(s.innerRatio);
    node.resize(w, h);
  } else if (kind === 'polygon') {
    node = figma.createPolygon();
    if (s.points) node.pointCount = Math.max(3, s.points);
    node.resize(w, h);
  } else if (kind === 'path' && s.path && s.path.verts && s.path.verts.length >= 2) {
    node = figma.createVector();
    node.vectorPaths = [{ windingRule: 'NONZERO', data: buildSvgPath(s.path).d }];
  } else {
    node = figma.createRectangle(); node.resize(w, h);
  }
  node.fills = s.fill ? [paintFor(s.fill, name, 'fill')] : [];
  if (s.stroke) {
    if (s.stroke.gradient) node.strokes = [paintFor(s.stroke, name, 'stroke')];
    else if (s.stroke.color) node.strokes = [solidPaint(s.stroke.color)];
    if (s.stroke.width) node.strokeWeight = s.stroke.width;
  }
  if (s.cornerRadius && 'cornerRadius' in node) {
    node.cornerRadius = Math.min(s.cornerRadius, Math.min(w, h) / 2);
  }
  return node;
}

// AE bezier path -> SVG path string, offset so the bounding box starts at (0,0). AE
// tangents are relative to their vertex; a cubic segment's control points are
// vertex+outTangent (leaving) and nextVertex+inTangent (arriving). AE and SVG both use
// y-down, so no axis flip. Returns { d, w, h }.
function buildSvgPath(path) {
  var V = path.verts, IN = path.inTan, OUT = path.outTan, n = V.length;
  // bbox over vertices and their control points
  var xs = [], ys = [];
  for (var i = 0; i < n; i++) {
    xs.push(V[i][0], V[i][0] + IN[i][0], V[i][0] + OUT[i][0]);
    ys.push(V[i][1], V[i][1] + IN[i][1], V[i][1] + OUT[i][1]);
  }
  var minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys);
  var maxX = Math.max.apply(null, xs), maxY = Math.max.apply(null, ys);
  function px(x) { return (x - minX).toFixed(3); }
  function py(y) { return (y - minY).toFixed(3); }
  function seg(a, b) {
    // cubic from vertex a to vertex b
    var c1x = V[a][0] + OUT[a][0], c1y = V[a][1] + OUT[a][1];
    var c2x = V[b][0] + IN[b][0], c2y = V[b][1] + IN[b][1];
    return 'C ' + px(c1x) + ' ' + py(c1y) + ' ' + px(c2x) + ' ' + py(c2y) + ' ' + px(V[b][0]) + ' ' + py(V[b][1]) + ' ';
  }
  var d = 'M ' + px(V[0][0]) + ' ' + py(V[0][1]) + ' ';
  for (var k = 0; k < n - 1; k++) d += seg(k, k + 1);
  if (path.closed) { d += seg(n - 1, 0); d += 'Z'; }
  return { d: d, w: maxX - minX, h: maxY - minY };
}

function createImage(L) {
  var node = figma.createRectangle();
  var img = L.image;
  var size = (img && img.size) || [100, 100];
  node.resize(Math.max(1, size[0]), Math.max(1, size[1]));
  var bytes = img && img.file ? IMAGES[img.file] : null;
  if (bytes) {
    var image = figma.createImage(bytes);
    node.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
  } else {
    node.fills = [solidPaint([0.6, 0.6, 0.6])]; // placeholder when image not provided
    if (img && img.file) log('Image not selected: ' + img.file + ' (gray placeholder)');
  }
  return node;
}

// --- positioning ------------------------------------------------------------
// AE places the layer's ANCHOR POINT at `position` (parent space). The anchor and
// content bounds live in the layer's own coordinate space, where content starts at
// sourceRect.{left,top} — NOT at (0,0). So the content top-left relative to the anchor
// is (sourceRect.topLeft - anchor), and under scale that offset scales too. Figma x/y
// is the node's top-left, so:
//     topLeft = position + (sourceRect.topLeft - anchor) * scale
// Order matters: resize for scale FIRST (changes width/height), then set x/y.
// origin = comp-space top-left of the Figma container this node sits in ([0,0] for the
// root frame). Positions are computed in comp space, then made container-relative.
// `skipOpacity` when the caller (a parent wrapper) handles opacity elsewhere.
function positionNode(node, L, comp, origin, skipOpacity) {
  origin = origin || [0, 0];
  var tr = L.transform || {};
  var kf = tr.keyframes || {};
  var posKeys = kf.position;
  var animScale = kf.scale && kf.scale.length;
  var animRot   = kf.rotation && kf.rotation.length;
  var animOp    = kf.opacity && kf.opacity.length;

  // Fast path: comp-space bounds are the authoritative rendered top-left + size. Used
  // when position isn't keyframed (compBounds is a t=0 snapshot). Made container-relative.
  if (L.compBounds && !(posKeys && posKeys.length)) {
    var cb = L.compBounds; // [x, y, w, h] — axis-aligned rendered bbox, rotation baked in
    // Vectors auto-size to their path geometry; resizing would stretch the curve. The SVG
    // is built with the same control-point origin as compBounds, so x/y placement aligns.
    if ('resize' in node && node.type !== 'VECTOR') node.resize(Math.max(1, cb[2]), Math.max(1, cb[3]));
    node.x = cb[0] - origin[0];
    node.y = cb[1] - origin[1];
    // compBounds already reflects the rotated box; re-rotating would double-count.
    if (tr.opacity != null && !animOp && !skipOpacity) node.opacity = clamp01(tr.opacity[0] / 100);
    return;
  }

  // Animated-position resting = first position keyframe (the TRANSLATION track animates
  // deltas from here). AE position is anchor-based; content top-left = pos + (sr - anchor).
  var pos = (posKeys && posKeys.length) ? posKeys[0].value : (tr.position || [0, 0]);
  var anchor = tr.anchor || [0, 0];
  var sr = L.sourceRect || [0, 0, node.width, node.height]; // [left, top, w, h]

  var sx = 1, sy = 1;
  if (tr.scale && !animScale) {
    sx = tr.scale[0] / 100;
    sy = (tr.scale[1] != null ? tr.scale[1] : tr.scale[0]) / 100;
  }
  if ('resize' in node && sx > 0 && sy > 0) {
    node.resize(Math.max(1, sr[2] * sx), Math.max(1, sr[3] * sy));
  }

  node.x = pos[0] + (sr[0] - anchor[0]) * sx - origin[0];
  node.y = pos[1] + (sr[1] - anchor[1]) * sy - origin[1];

  if (tr.rotation != null && !animRot) node.rotation = -tr.rotation[0]; // AE cw+, Figma ccw+
  if (tr.opacity != null && !animOp && !skipOpacity) node.opacity = clamp01(tr.opacity[0] / 100);
}

// --- keyframes (Motion API, beta) ------------------------------------------
// `only` (optional array of AE prop names) restricts which tracks are applied — used to
// put position/rotation/scale on a parent's wrapper frame while opacity stays on its
// content node (AE parenting inherits transform but NOT opacity).
function applyKeyframes(node, L, comp, only) {
  var kf = (L.transform && L.transform.keyframes) || {};
  if (!node.applyManualKeyframeTrack) return; // API not present -> static only
  var applied = false;

  for (var aeProp in MOTION_PROP) {
    if (only && only.indexOf(aeProp) === -1) continue;
    var keys = kf[aeProp];
    if (!keys || keys.length < 2) continue;
    var fields = MOTION_PROP[aeProp];

    for (var axis = 0; axis < fields.length; axis++) {
      var track = buildTrack(keys, axis, aeProp, comp);
      node.applyManualKeyframeTrack({ type: 'PROPERTY', name: fields[axis] }, track);
      applied = true;
    }
  }

  // setTimelineDuration(timelineId, seconds): the timeline lives on the containing
  // top-level frame and is read from node.timelines. Extend only — never shorten.
  if (applied && node.setTimelineDuration && node.timelines && node.timelines.length) {
    var tl = node.timelines[0];
    if (tl && tl.duration < comp.duration) node.setTimelineDuration(tl.id, comp.duration);
  }
}

// AE effects -> Figma effects. v1: Drop Shadow. AE direction (deg, cw from up) + distance
// -> offset; softness -> blur radius; opacity (0-255) -> shadow alpha.
function applyEffects(node, L) {
  var fx = L.effects;
  if (!fx || !fx.length || !('effects' in node)) return;
  var effects = [];
  for (var i = 0; i < fx.length; i++) {
    var e = fx[i];
    if (e.type === 'dropShadow') {
      var rad = (e.direction || 0) * Math.PI / 180;
      var dist = e.distance || 0;
      var c = e.color || [0, 0, 0];
      effects.push({
        type: 'DROP_SHADOW',
        color: { r: clamp01(c[0]), g: clamp01(c[1]), b: clamp01(c[2]), a: clamp01((e.opacity != null ? e.opacity : 255) / 255) },
        offset: { x: dist * Math.sin(rad), y: -dist * Math.cos(rad) },
        radius: e.softness || 0,
        spread: 0,
        visible: true,
        blendMode: 'NORMAL'
      });
    }
  }
  if (effects.length) node.effects = effects;
}

// AE Trim Paths -> Figma PATH_TRIM_START/END (0-1). AE trim is 0-100 %. Applies the
// static value and, if keyframed, a manual track (the "write-on" / draw-on animation).
function applyTrim(node, L, comp) {
  var trim = L.shape && L.shape.trim;
  if (!trim || !node.applyManualKeyframeTrack) return;

  var axes = [
    { field: 'PATH_TRIM_START', keys: trim.startKeys, val: trim.start },
    { field: 'PATH_TRIM_END', keys: trim.endKeys, val: trim.end }
  ];
  var applied = false;
  for (var i = 0; i < axes.length; i++) {
    var a = axes[i];
    if (a.keys && a.keys.length >= 2) {
      var frames = [];
      for (var k = 0; k < a.keys.length; k++) {
        var key = a.keys[k];
        var f = { timelinePosition: key.t, value: { type: 'FLOAT', value: clamp01(key.value[0] / 100) } };
        if (k > 0) {
          // Easing dv must be in the SAME units as AE's speed (0-100 %/s), so use the RAW
          // keyframe values here — dividing by 100 (as the trim VALUE does) would make dv
          // 100x too small vs speed, producing out-of-range bezier handles.
          var dv = key.value[0] - a.keys[k - 1].value[0];
          var e = mapEasing(axisEase(a.keys[k - 1].easeOut, 0), axisEase(key.easeIn, 0), key.interp, key.t - a.keys[k - 1].t, dv);
          if (e) f.easing = e;
        }
        frames.push(f);
      }
      try {
        node.applyManualKeyframeTrack({ type: 'PROPERTY', name: a.field },
          { baseValue: { type: 'FLOAT', value: clamp01(a.keys[0].value[0] / 100) }, keyframes: frames });
        applied = true;
      } catch (e) { /* field unsupported on this node type */ }
    }
  }
  if (applied && node.setTimelineDuration && node.timelines && node.timelines.length) {
    var tl = node.timelines[0];
    if (tl && tl.duration < comp.duration) node.setTimelineDuration(tl.id, comp.duration);
  }
}

// Convert AE keyframes -> Motion track. timelinePosition is normalized 0..1 over the
// comp duration. value is the per-axis scalar (opacity 0..100 -> 0..1, scale % -> ratio).
//
// position (TRANSLATION_X/Y) is RELATIVE: Figma translation is a delta from the node's
// resting x/y, not an absolute coord. So we subtract the first keyframe's value — the
// node is placed at that resting spot by positionNode(), and the track animates the
// offset from it. (Confirmed by the API example: baseValue 0, first key 0, then 120.)
function buildTrack(keys, axis, aeProp, comp) {
  var origin = (aeProp === 'position') ? scalarValue(keys[0], axis, aeProp) : 0;
  var base = scalarValue(keys[0], axis, aeProp) - origin; // 0 for position
  var frames = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var f = {
      // timelinePosition is in SECONDS (not normalized) — Figma timeline is in seconds.
      timelinePosition: key.t,
      value: { type: 'FLOAT', value: scalarValue(key, axis, aeProp) - origin }
    };
    // Easing describes the segment ENTERING this keyframe (from the previous one),
    // so it needs prev.easeOut + this.easeIn. The first keyframe has no incoming segment.
    if (i > 0) {
      var v0 = scalarValue(keys[i - 1], axis, aeProp);
      var v1 = scalarValue(key, axis, aeProp);
      // Separated position stores ease as a per-axis array [xEase, yEase]; pick this axis.
      var outE = axisEase(keys[i - 1].easeOut, axis);
      var inE  = axisEase(key.easeIn, axis);
      var easing = mapEasing(outE, inE, key.interp, key.t - keys[i - 1].t, v1 - v0);
      if (easing) f.easing = easing;
    }
    frames.push(f);
  }
  return { baseValue: { type: 'FLOAT', value: base }, keyframes: frames };
}

function scalarValue(key, axis, aeProp) {
  var raw = (key.value && key.value[axis] != null) ? key.value[axis] : (key.value ? key.value[0] : 0);
  if (aeProp === 'opacity') return clamp01(raw / 100);
  if (aeProp === 'scale') return raw / 100;
  if (aeProp === 'rotation') return -raw; // match positionNode sign convention
  return raw; // position translation in px
}

// AE ease -> Figma cubic bezier for the segment `from`->`to`, spanning dt seconds and
// dv value-units. AE temporal ease per side = {influence (0.1..100, % of segment time),
// speed (value-units/sec)}. Canonical AE-velocity->bezier conversion (Creative COW):
//   averageSpeed = |dv| / dt
//   x1 = outInf/100,        y1 = x1 * outSpeed / averageSpeed
//   x2 = 1 - inInf/100,     y2 = 1 - (1 - x2) * inSpeed / averageSpeed
// Note |dv| (absolute): the bezier is in NORMALIZED 0..1 value space, so a decreasing
// segment uses the same curve shape — sign is carried by the keyframe values, not the
// easing. (Using signed dv flips the handles on decreasing segments = the visible bug.)
// Shape confirmed against Figma Motion API (figma-use-motion): easing controls the
// segment from the previous keyframe to this one.
// Resolve a keyframe's ease for a given axis. Separated position stores ease as a
// per-axis array [xEase, yEase]; everything else is a single ease object for all axes.
function axisEase(ease, axis) {
  if (ease && (ease instanceof Array)) return ease[axis] || null;
  return ease || null;
}

function mapEasing(outE, inE, interp, dt, dv) {
  // HOLD: the OUTgoing interp of the start keyframe steps with no interpolation.
  if (interp === 'HOLD') return { type: 'HOLD' };
  if (!outE && !inE) return { type: 'LINEAR' };

  var x1 = clamp01((outE ? outE.influence : 0) / 100);
  var x2 = clamp01(1 - (inE ? inE.influence : 0) / 100);

  // The segment's path velocity shapes BOTH handles. AE reports it on the incoming side
  // of the destination keyframe; the source keyframe's out-speed is 0 when it's the first
  // keyframe (nothing precedes it). So take the representative segment speed = the larger
  // of the two ease speeds, and use it for both y-handles. Verified exact against AE.
  var y1 = 0, y2 = 1;
  if (dv && dt) {
    var avgSpeed = Math.abs(dv) / dt;
    var segSpeed = Math.max(outE ? outE.speed : 0, inE ? inE.speed : 0);
    if (avgSpeed > 0) {
      y1 = x1 * segSpeed / avgSpeed;
      y2 = 1 - (1 - x2) * segSpeed / avgSpeed;
    }
  }
  return {
    type: 'CUSTOM_CUBIC_BEZIER',
    easingFunctionCubicBezier: { x1: x1, y1: y1, x2: x2, y2: y2 }
  };
}

// --- paint / font / math helpers -------------------------------------------

function solidPaint(rgb) {
  return { type: 'SOLID', color: { r: clamp01(rgb[0]), g: clamp01(rgb[1]), b: clamp01(rgb[2]) } };
}

// Solid -> SOLID paint. Gradient -> a placeholder gradient in the right orientation.
// AE gradient color stops are unreadable via scripting (NO_VALUE), so we can't port the
// real colors — we render a visible gray->transparent gradient so the shape isn't blank
// and the orientation matches, then log it once so the user knows to recolor by hand.
var _gradientWarned = false;
function paintFor(paint, layerName, which) {
  if (!paint || !paint.gradient) return solidPaint(paint);
  if (!_gradientWarned) {
    log('Gradient colors cannot be read from AE (API limit) - imported as a gray placeholder. Recolor in Figma.');
    _gradientWarned = true;
  }
  var start = paint.start || [0, 0];
  var end = paint.end || [100, 0];
  // Build a gradientTransform from the AE start->end vector, normalized to 0..1 UV space.
  // AE points are in shape-local px; direction is what matters for orientation.
  var dx = end[0] - start[0], dy = end[1] - start[1];
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / len, uy = dy / len;
  // Map a unit vector to Figma's 2x3 gradientTransform (rotation only; placeholder).
  var transform = [[ux, uy, 0], [-uy, ux, 0]];
  var stops = [
    { position: 0, color: { r: 0.6, g: 0.6, b: 0.6, a: 1 } },
    { position: 1, color: { r: 0.3, g: 0.3, b: 0.3, a: 1 } }
  ];
  var type = (paint.gradType === 2) ? 'GRADIENT_RADIAL' : 'GRADIENT_LINEAR';
  return { type: type, gradientTransform: transform, gradientStops: stops };
}

async function loadFontSafe(family, style) {
  var candidates = [];
  if (family) {
    if (style) candidates.push({ family: family, style: style });   // best: "Segoe Sans Display" / "Semilight"
    candidates.push({ family: family, style: 'Regular' });
  }
  candidates.push({ family: 'Inter', style: 'Regular' });
  for (var i = 0; i < candidates.length; i++) {
    try { await figma.loadFontAsync(candidates[i]); return candidates[i]; }
    catch (e) { /* try next */ }
  }
  await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
  return { family: 'Roboto', style: 'Regular' };
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
