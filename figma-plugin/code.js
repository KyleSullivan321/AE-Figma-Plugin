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

  // Build the parent/child hierarchy so an animated parent (e.g. a null-object rig)
  // propagates its motion to children. AE parenting inherits position/rotation/scale
  // (NOT opacity). We rebuild each PARENT layer as a Figma FRAME centered on its anchor
  // point (so rotation/scale pivot around the anchor, matching AE) that carries the
  // parent's transform + tracks; the parent's own content and its children nest inside.
  var layerByIndex = {};
  var childrenOf = {}; // parentIndex -> [layer]
  var rootLayers = [];
  data.layers.forEach(function (L) { layerByIndex[L.index] = L; });
  data.layers.forEach(function (L) {
    if (L.parentIndex != null && layerByIndex[L.parentIndex]) {
      (childrenOf[L.parentIndex] = childrenOf[L.parentIndex] || []).push(L);
    } else {
      rootLayers.push(L);
    }
  });
  function isParent(L) { return !!(childrenOf[L.index] && childrenOf[L.index].length); }

  var motionOk = true;
  var count = 0;

  // Recursively build a layer into `container` (a Figma node), where `origin` is the
  // container's comp-space top-left ([0,0] for the root frame).
  async function build(L, container, origin) {
    var content = await createNode(L);
    count++;

    if (isParent(L)) {
      // Wrapper frame carries the layer's transform; content + children nest inside.
      var cb = L.compBounds || [0, 0, 100, 100];
      var w = Math.max(1, cb[2]), h = Math.max(1, cb[3]);
      var anchor = L.anchorComp || [cb[0] + w / 2, cb[1] + h / 2];
      var frame = figma.createFrame();
      frame.name = L.name;
      frame.clipsContent = false;
      frame.fills = [];
      frame.resize(w, h);
      // Center the frame on the anchor (comp space) => Figma's center-pivot rotation/scale
      // matches AE's anchor-pivot. Frame comp top-left:
      var fx = anchor[0] - w / 2, fy = anchor[1] - h / 2;
      container.appendChild(frame);
      frame.x = fx - origin[0];
      frame.y = fy - origin[1];

      // Parent transform (position/rotation/scale) goes on the frame — NOT opacity, which
      // AE parenting does not inherit. Static rotation/scale applied when not keyframed.
      var tr = L.transform || {};
      var kf = tr.keyframes || {};
      if (tr.rotation != null && !(kf.rotation && kf.rotation.length)) frame.rotation = -tr.rotation[0];
      try { applyKeyframes(frame, L, comp, ['position', 'rotation', 'scale']); }
      catch (err) { motionOk = false; log('Motion skipped for "' + L.name + '": ' + (err && err.message || err)); }

      // The parent's own visible content sits inside the frame (static; frame carries the
      // transform). Its OPACITY stays here (opacity is per-layer, not inherited).
      if (content) {
        frame.appendChild(content);
        content.x = cb[0] - fx;
        content.y = cb[1] - fy;
        var trOp = tr.opacity, animOp = kf.opacity && kf.opacity.length;
        if (trOp != null && !animOp) content.opacity = clamp01(trOp[0] / 100);
        try { applyKeyframes(content, L, comp, ['opacity']); } catch (e) {}
      }

      // Children nest inside the frame. Append highest AE index first so index 1 ends on top.
      var kids = childrenOf[L.index].slice().sort(function (a, b) { return b.index - a.index; });
      for (var i = 0; i < kids.length; i++) await build(kids[i], frame, [fx, fy]);
    } else {
      if (!content) return;
      container.appendChild(content);
      positionNode(content, L, comp, origin);
      try { applyKeyframes(content, L, comp); }
      catch (err) { motionOk = false; log('Motion skipped for "' + L.name + '": ' + (err && err.message || err)); }
    }
  }

  // Root layers, highest AE index first so layer 1 renders on top.
  var roots = rootLayers.slice().sort(function (a, b) { return b.index - a.index; });
  for (var r = 0; r < roots.length; r++) await build(roots[r], root, [0, 0]);

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
  // Always have a loadable font; fall back to Inter Regular if AE font isn't present.
  var font = await loadFontSafe(t.font);
  node.fontName = font;
  node.characters = (t.value != null) ? String(t.value) : L.name;
  if (t.fontSize) node.fontSize = t.fontSize;
  if (t.color) node.fills = [solidPaint(t.color)];
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
  var size = s.size || [100, 100];
  var w = Math.max(1, size[0]), h = Math.max(1, size[1]);
  var kind = s.shapeKind || 'rect';

  // Create the matching Figma primitive instead of always a rectangle.
  var node;
  if (kind === 'ellipse') {
    node = figma.createEllipse();
  } else if (kind === 'star') {
    node = figma.createStar();
    if (s.points) node.pointCount = Math.max(3, s.points);
    if (s.innerRatio != null) node.innerRadius = clamp01(s.innerRatio);
  } else if (kind === 'polygon') {
    node = figma.createPolygon();
    if (s.points) node.pointCount = Math.max(3, s.points);
  } else {
    // 'rect' or 'path' (freeform bezier falls back to a bounding rectangle for now)
    node = figma.createRectangle();
  }
  node.resize(w, h);

  // Fill only if AE had an enabled fill — otherwise genuinely no fill (don't invent gray).
  node.fills = s.fill ? [paintFor(s.fill, L.name, 'fill')] : [];
  if (s.stroke) {
    if (s.stroke.gradient) node.strokes = [paintFor(s.stroke, L.name, 'stroke')];
    else if (s.stroke.color) node.strokes = [solidPaint(s.stroke.color)];
    if (s.stroke.width) node.strokeWeight = s.stroke.width;
  }
  // Corner radius applies to rectangles only.
  if (s.cornerRadius && 'cornerRadius' in node) {
    node.cornerRadius = Math.min(s.cornerRadius, Math.min(w, h) / 2);
  }
  return node;
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
    if ('resize' in node) node.resize(Math.max(1, cb[2]), Math.max(1, cb[3]));
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

async function loadFontSafe(family) {
  var candidates = [];
  if (family) candidates.push({ family: family, style: 'Regular' });
  candidates.push({ family: 'Inter', style: 'Regular' });
  for (var i = 0; i < candidates.length; i++) {
    try { await figma.loadFontAsync(candidates[i]); return candidates[i]; }
    catch (e) { /* try next */ }
  }
  // last resort: whatever the default text node ships with
  await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
  return { family: 'Roboto', style: 'Regular' };
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
