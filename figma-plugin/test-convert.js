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

console.log('ok — all conversion checks passed');
