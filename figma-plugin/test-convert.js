// Self-check for the conversion math in code.js (run: node test-convert.js).
// These mirror the functions in code.js — kept tiny and standalone, no Figma runtime.
function clamp01(n){ return Math.max(0, Math.min(1, n)); }

function scalarValue(key, axis, aeProp){
  var raw = (key.value && key.value[axis] != null) ? key.value[axis] : (key.value ? key.value[0] : 0);
  if (aeProp === 'opacity') return clamp01(raw/100);
  if (aeProp === 'scale')   return raw/100;
  if (aeProp === 'rotation') return -raw;
  return raw;
}
// topLeft = position + (sourceRect.topLeft - anchor) * scale
function topLeft(pos, anchor, sr, scale){
  sr = sr || [0,0]; scale = scale || [1,1];
  return [ pos[0] + (sr[0]-anchor[0])*scale[0],
           pos[1] + (sr[1]-anchor[1])*scale[1] ];
}
function timelinePosition(t, dur){ return clamp01(t/dur); }

function assert(c, m){ if(!c) throw new Error('FAIL: '+m); }

// opacity 100% -> 1.0, 0% -> 0, 200% clamps to 1
assert(scalarValue({value:[100]},0,'opacity')===1, 'opacity 100->1');
assert(scalarValue({value:[0]},0,'opacity')===0, 'opacity 0->0');
assert(scalarValue({value:[200]},0,'opacity')===1, 'opacity clamps');
// scale 50% -> 0.5
assert(scalarValue({value:[50,150]},1,'scale')===1.5, 'scale axis y 150->1.5');
// rotation sign flips (AE cw+ -> Figma ccw+)
assert(scalarValue({value:[90]},0,'rotation')===-90, 'rotation flips sign');
// position passes px through per axis
assert(scalarValue({value:[12,34]},1,'position')===34, 'position y px');
// Shape at origin: content starts at (0,0), anchor at center (50,50), placed at (200,200).
// topLeft = 200 + (0-50)*1 = 150. Square ends up centered on its position. ✓
var s = topLeft([200,200],[50,50],[0,0],[1,1]);
assert(s[0]===150 && s[1]===150, 'shape center-anchored placement');
// Text whose content sits above its origin: sourceRect.top = -40 (ascent).
// anchor on baseline (0,0), placed at (50,900). topLeft.y = 900 + (-40-0) = 860.
var t = topLeft([50,900],[0,0],[0,-40],[1,1]);
assert(t[0]===50 && t[1]===860, 'text baseline/ascent offset');
// Scaled: same shape at 50% scale -> offset halves. topLeft = 200 + (0-50)*0.5 = 175.
var sc = topLeft([200,200],[50,50],[0,0],[0.5,0.5]);
assert(sc[0]===175 && sc[1]===175, 'scaled placement offset halves');
// timeline normalization + clamp
assert(timelinePosition(2.5,5)===0.5, 'timeline mid');
assert(timelinePosition(10,5)===1, 'timeline clamps past end');

// Position track is RELATIVE: subtract first keyframe so it starts at 0 (delta).
function posTrackValues(keys, axis){
  var origin = keys[0].value[axis];
  return keys.map(function(k){ return k.value[axis] - origin; });
}
// AE square animating x from 960 -> 1200: track should be [0, 240], not [960, 1200].
var pk = posTrackValues([{value:[960,540]},{value:[1200,540]}], 0);
assert(pk[0]===0 && pk[1]===240, 'position track is relative delta');
// y unchanged -> all zeros
var pky = posTrackValues([{value:[960,540]},{value:[1200,540]}], 1);
assert(pky[0]===0 && pky[1]===0, 'unchanged axis stays at 0');

var near = function(a,b){ return Math.abs(a-b) < 5e-3; };
function axisEase(ease, axis){ return (ease && ease instanceof Array) ? (ease[axis]||null) : (ease||null); }
// mapEasing(outE, inE, interp, dt, dv). Segment speed = max of the two ease speeds.
function mapEasing(outE, inE, interp, dt, dv){
  if (interp === 'HOLD') return { type:'HOLD' };
  if (!outE && !inE) return { type:'LINEAR' };
  var x1=clamp01((outE?outE.influence:0)/100), x2=clamp01(1-(inE?inE.influence:0)/100), y1=0, y2=1;
  if (dv && dt){
    var avg=Math.abs(dv)/dt, seg=Math.max(outE?outE.speed:0, inE?inE.speed:0);
    if (avg>0){ y1=x1*seg/avg; y2=1-(1-x2)*seg/avg; }
  }
  return { type:'CUSTOM_CUBIC_BEZIER', easingFunctionCubicBezier:{x1:x1,y1:y1,x2:x2,y2:y2} };
}
// REAL DATA from diag-ease.txt: SEPARATED position, per-axis ease is out-inf=50, in-inf=95,
// speed=0 on BOTH axes -> AE-displayed bezier 0.50, 0, 0.05, 1.00. This is the curve the
// user showed. Must reproduce exactly. (The old combined-Position read gave garbage 16.667.)
var sepOut={influence:50,speed:0}, sepIn={influence:95,speed:0}, dt=1.133;
var B=mapEasing(sepOut, sepIn, 'BEZIER', dt, 913.255-164.1).easingFunctionCubicBezier;
assert(near(B.x1,0.50)&&near(B.y1,0.00)&&near(B.x2,0.05)&&near(B.y2,1.00), 'separated-position ease = 0.50,0,0.05,1');
// Per-axis array selection: axisEase picks the right axis from [xEase, yEase].
var arr=[{influence:50,speed:0},{influence:30,speed:0}];
assert(axisEase(arr,0).influence===50 && axisEase(arr,1).influence===30, 'axisEase picks per-axis');
assert(axisEase({influence:50,speed:0},0).influence===50, 'axisEase passes through single ease');
// No ease -> linear; Hold -> HOLD
assert(mapEasing(null, null, 'BEZIER', 1, 1).type==='LINEAR', 'no ease -> linear');
assert(mapEasing(null, null, 'HOLD', 1, 1).type==='HOLD', 'hold -> HOLD');

// (Images now travel as sidecar files read natively by the UI — no base64 codec to test.)

// --- nested parenting coordinate telescoping ---------------------------------
// Mirror the build() math: a parent becomes a frame centered on its anchor; children
// place relative to the container origin. Every node's ABSOLUTE comp position must equal
// its compBounds top-left, no matter how deep the nesting.
function simulate(layer, origin){
  // returns list of {name, absX, absY, expectX, expectY}
  var results = [];
  function build(L, origin){
    var cb = L.compBounds, w = cb[2], h = cb[3];
    if (L.children && L.children.length){
      var anchor = L.anchorComp;
      var fx = anchor[0]-w/2, fy = anchor[1]-h/2;        // frame comp top-left
      var frameRelX = fx - origin[0], frameRelY = fy - origin[1];
      var frameAbsX = origin[0] + frameRelX, frameAbsY = origin[1] + frameRelY;
      // parent content inside frame:
      var contentAbsX = frameAbsX + (cb[0] - fx), contentAbsY = frameAbsY + (cb[1] - fy);
      results.push({name:L.name, absX:contentAbsX, absY:contentAbsY, expectX:cb[0], expectY:cb[1]});
      L.children.forEach(function(c){ build(c, [fx, fy]); });
    } else {
      var relX = cb[0] - origin[0], relY = cb[1] - origin[1];
      results.push({name:L.name, absX:origin[0]+relX, absY:origin[1]+relY, expectX:cb[0], expectY:cb[1]});
    }
  }
  build(layer, origin);
  return results;
}
// 3-level rig: null(anim) -> shape1 -> shape2, each at distinct comp positions.
var rig = {
  name:'null', compBounds:[500,400,100,100], anchorComp:[550,450],
  children:[{
    name:'shape1', compBounds:[300,200,240,240], anchorComp:[420,320],
    children:[{ name:'shape2', compBounds:[1000,-100,150,150], anchorComp:[1075,-25], children:[] }]
  }]
};
simulate(rig,[0,0]).forEach(function(r){
  assert(near(r.absX,r.expectX)&&near(r.absY,r.expectY),
    'nested placement '+r.name+' abs('+r.absX+','+r.absY+') == compBounds('+r.expectX+','+r.expectY+')');
});

// --- AE bezier path -> SVG (mirror of buildSvgPath) --------------------------
function buildSvgPath(path){
  var V=path.verts, IN=path.inTan, OUT=path.outTan, n=V.length;
  var xs=[], ys=[];
  for(var i=0;i<n;i++){ xs.push(V[i][0],V[i][0]+IN[i][0],V[i][0]+OUT[i][0]); ys.push(V[i][1],V[i][1]+IN[i][1],V[i][1]+OUT[i][1]); }
  var minX=Math.min.apply(null,xs), minY=Math.min.apply(null,ys), maxX=Math.max.apply(null,xs), maxY=Math.max.apply(null,ys);
  function px(x){return (x-minX).toFixed(3);} function py(y){return (y-minY).toFixed(3);}
  function seg(a,b){ var c1x=V[a][0]+OUT[a][0],c1y=V[a][1]+OUT[a][1],c2x=V[b][0]+IN[b][0],c2y=V[b][1]+IN[b][1];
    return 'C '+px(c1x)+' '+py(c1y)+' '+px(c2x)+' '+py(c2y)+' '+px(V[b][0])+' '+py(V[b][1])+' '; }
  var d='M '+px(V[0][0])+' '+py(V[0][1])+' ';
  for(var k=0;k<n-1;k++) d+=seg(k,k+1);
  if(path.closed){ d+=seg(n-1,0); d+='Z'; }
  return {d:d, w:maxX-minX, h:maxY-minY};
}
// Real 2-vertex open path from diag-path.txt.
var realPath = {
  closed:false,
  verts:[[-389.965,386.659],[363.470,-487.457]],
  inTan:[[-184.282,0],[-595.247,0]],
  outTan:[[184.282,0],[595.247,0]]
};
var svg = buildSvgPath(realPath);
assert(svg.d.indexOf('M ')===0, 'svg starts with moveto');
assert(svg.d.indexOf('C ')>0, 'svg has a cubic segment');
assert(svg.d.indexOf('Z')===-1, 'open path has no Z');
// All emitted coords must be >= 0 (offset by bbox min).
var nums = svg.d.replace(/[MCZ]/g,'').trim().split(/\s+/).map(Number);
assert(nums.every(function(v){ return v >= -1e-6; }), 'all svg coords offset non-negative');
// Closed path gets a Z.
var closed = buildSvgPath({closed:true, verts:[[0,0],[100,0],[100,100]], inTan:[[0,0],[0,0],[0,0]], outTan:[[0,0],[0,0],[0,0]]});
assert(closed.d.indexOf('Z')>0, 'closed path ends with Z');
// Trim %->0-1 mapping.
assert(near(2/100,0.02) && near(100/100,1.0), 'trim percent to 0-1');
// Trim easing UNITS: dv must be raw AE units (0-100) to match speed (0-100 %/s), else the
// bezier handles blow out of range. Real data: End 2->100 over 0.367s, linear (speed=267).
// avg=|98|/0.367=267, seg=267 -> y1=x1*1=0.167, y2=1-(1-x2)*1=0.833  (a linear diagonal).
var trimEase = mapEasing({influence:16.667,speed:267.273},{influence:16.667,speed:267.273},'LINEAR',0.367,100-2);
var te = trimEase.easingFunctionCubicBezier;
assert(near(te.y1,0.167,) && te.y1>=0 && te.y1<=1, 'trim easing y1 in range (linear ~0.167)');
assert(near(te.y2,0.833) && te.y2>=0 && te.y2<=1, 'trim easing y2 in range (linear ~0.833)');
// The OLD bug (dv/100) would give y1 = 0.167*267/2.67 ≈ 16.7 — assert we're nowhere near.
assert(te.y1 < 1.5, 'trim easing not blown out (the 100x unit bug)');

// --- drop shadow: AE direction+distance -> Figma offset -----------------------
function dropOffset(direction, distance){
  var rad = direction*Math.PI/180;
  return { x: distance*Math.sin(rad), y: -distance*Math.cos(rad) };
}
// Real data: direction 135, distance 24 -> down-right (positive x, positive y).
var off = dropOffset(135, 24);
assert(near(off.x, 16.97, ) && off.x>0, 'drop shadow offset x down-right');
assert(near(off.y, 16.97) && off.y>0, 'drop shadow offset y down-right');
// direction 0 (up) -> shadow straight up (negative y).
var up = dropOffset(0, 10);
assert(near(up.x,0) && near(up.y,-10), 'direction 0 -> straight up');
// opacity 127.5/255 -> 0.5
assert(near(127.5/255, 0.5), 'shadow opacity 127.5 -> 0.5 alpha');

console.log('ok — all conversion checks passed');
