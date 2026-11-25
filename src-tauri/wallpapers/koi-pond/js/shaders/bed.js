/*
 * shaders/bed.js — pond floor, rocks, pebbles, silt and water plants.
 *
 * Baked once per resize (setup.js bakeBed) into 3 textures through multiple render targets:
 *   o0 -> T.bedA  rgb sqrt(colour), a terrain height (above WL = dry stone)
 *   o1 -> T.veg   water plants: rgb sqrt(colour), a coverage
 *   o2 -> T.info  r shore proximity, g direct-sun factor, b plant tip (for swaying), a ambient occlusion
 *
 * Defines: FS_BED
 */
"use strict";

/* ---------- pond floor, rocks and plants (baked once) ---------- */
const FS_BED = `
layout(location = 0) out vec4 o0;   // rgb: sqrt(colour) (dry rock pre-lit, wet = albedo), a: terrain height
layout(location = 1) out vec4 o1;   // water plants: rgb sqrt(colour), a coverage
layout(location = 2) out vec4 o2;   // r shore proximity, g direct-sun factor, b plant tip, a ambient occlusion
const float KH = .10;

vec4 rockLayer(vec2 p, float cell, float pBase, float hLo, float hHi, float seed){
  vec2 ip = floor(p/cell);
  vec4 best = vec4(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 c = ip + vec2(i, j);
    vec2 h = hash22(c + seed);
    vec2 cp = (c + .2 + .6*h)*cell;
    float sb = shoreBand(cp);
    if (hash12(c + seed + 7.1) > clamp(pBase + sb*14., 0., .97)) continue;
    float R = cell*(.52 + .28*hash12(c + seed + 3.1));
    vec2 d = p - cp + (vec2(vnoise(p*26. + seed), vnoise(p*26. + seed + 9.)) - .5)*cell*.20;
    float a = atan(d.y, d.x);
    float rr = R*(1. + .14*sin(a*2. + h.x*6.28) + .08*sin(a*3. + h.y*6.28) + .05*sin(a*5. + h.x*17.));
    float t = length(d)/rr;
    if (t >= 1.) continue;
    float top = mix(hLo, hHi, clamp(sb*8. + .5, 0., 1.))*(.82 + .18*hash12(c + seed + 5.3));
    float dm = sqrt(1. - t*t);
    float hg = top*pow(dm, .5);
    if (hg > best.x) best = vec4(hg, hash12(c + seed + 11.), dm, 1.);
  }
  return best;
}
float floorH(vec2 p){
  float h = .10 + .33*ss(-.32, .03, shoreBand(p));
  h += .06*(fbm(p*2.4 + 4., 4) - .5);
  return h - .05*ss(.55*uA, 0., p.x);
}
// x height, y material (0 floor, 1 rock), z rock id, w dome; peb = pebble (height, id, dome)
vec4 terrain(vec2 p, out vec3 peb){
  float f = floorH(p);
  peb = vec3(0.);
  float sh = ss(.30, .45, f);
  if (sh > 0.){
    vec2 ip = floor(p/.017);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 c = ip + vec2(i, j);
      if (hash12(c + 33.) > .78*sh) continue;
      vec2 h = hash22(c + 31.);
      vec2 cp = (c + .25 + .5*h)*.017;
      float R = .017*(.30 + .26*hash12(c + 35.));
      float an = h.y*6.28; vec2 d = p - cp; d = mat2(cos(an), sin(an), -sin(an), cos(an))*d; d.y *= 1.3 + .4*h.x;
      float t = length(d)/R;
      if (t < 1.){ float dm = sqrt(1. - t*t); float hg = .022*dm; if (hg > peb.x) peb = vec3(hg, hash12(c + 37.), dm); }
    }
  }
  vec4 res = vec4(f + peb.x, 0., 0., 0.);
  vec4 r1 = rockLayer(p, .12, .28, .50, 1.0, 0.);
  vec4 r2 = rockLayer(p, .052, .05, .44, .80, 17.);
  float rough = fbm(p*40., 3) - .5;
  if (r2.w > 0.){ float h2 = r2.x + rough*.035*r2.z; if (h2 > res.x) res = vec4(h2, 1., r2.y, r2.z); }
  if (r1.w > 0.){ float h1 = r1.x + rough*.040*r1.z; if (h1 > res.x) res = vec4(h1, 1., r1.y, r1.z); }
  return res;
}
float rocksOnly(vec2 p){ return max(rockLayer(p, .12, .28, .50, 1., 0.).x, rockLayer(p, .052, .05, .44, .80, 17.).x); }

vec3 rockCol(vec2 p, float id, float h, vec3 n){
  vec3 c = mix(vec3(.36, .35, .33), vec3(.56, .54, .50), id);
  c = mix(c, vec3(.50, .44, .37), ss(.55, .9, fract(id*7.31))*.6);
  c *= .78 + .44*fbm(p*150. + id*20., 3);
  c *= .88 + .2*fbm(p*40. + id*3., 3);
  float cr = abs(fbm(p*24. + id*9., 4) - .5);
  c *= .74 + .26*ss(.0, .045, cr);
  float mossN = fbm(p*13. + id*5., 5);
  float moss = ss(.57, .74, mossN + .14*n.z - .22*dot(n.xy, normalize(LSUN.xy)))*ss(WL + .02, WL + .10, h);
  vec3 mc = mix(vec3(.17, .23, .09), vec3(.30, .35, .15), fbm(p*55., 3));
  c = mix(c, mc, moss*.75);
  float li = ss(.70, .76, fbm(p*28. + 3.3 + id, 3));
  c = mix(c, vec3(.66, .66, .52), li*.45*(1. - moss));
  c *= 1. - .42*ss(WL + .07, WL + .005, h);              // wet band just above the waterline
  if (h < WL) c = mix(c, vec3(.20, .22, .11), .5)*.85;   // algae below it
  return c;
}
vec3 floorCol(vec2 p, float f, vec3 peb){
  float sh = ss(.22, .44, f);
  float n = fbm(p*8., 5);
  vec3 silt = mix(vec3(.16, .16, .10), vec3(.25, .23, .15), n);
  vec3 sand = mix(vec3(.44, .40, .30), vec3(.56, .51, .39), fbm(p*34., 3));
  vec3 c = mix(silt, sand, ss(.15, .85, sh + (n - .5)*.5));
  c *= .86 + .28*vnoise(p*180.);
  c = mix(c, vec3(.22, .14, .07), ss(.74, .80, fbm(p*15. + 9., 3))*.45);   // sunken leaves
  if (peb.x > 0.){
    vec3 pc = mix(vec3(.42, .41, .38), vec3(.56, .45, .32), ss(.3, .7, peb.y));
    pc = mix(pc, vec3(.24, .23, .22), ss(.8, .95, peb.y));
    pc = mix(pc, vec3(.55, .36, .28), ss(.12, 0., peb.y));
    c = mix(c, pc*(.8 + .25*peb.z), ss(.0, .25, peb.z));
  }
  return c;
}
// spider-like water weed: fine strands radiating from each clump
vec4 plants(vec2 p, out float tip){
  tip = 0.;
  vec4 acc = vec4(0.);
  const float cell = .13;
  vec2 ip = floor(p/cell);
  float px = 1.5/uRes.y;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 c = ip + vec2(i, j);
    vec2 h = hash22(c + 41.);
    vec2 cp = (c + .2 + .6*h)*cell;
    float sb = shoreBand(cp);
    float pr = .10 + .55*ss(-.34, -.14, sb)*ss(-.02, -.08, sb);
    if (hash12(c + 43.) > pr) continue;
    float R = cell*(.42 + .40*hash12(c + 44.));
    vec2 d = p - cp; float r = length(d);
    if (r > R) continue;
    float a = atan(d.y, d.x);
    float N = 7. + floor(hash12(c + 45.)*6.);
    float bend = (hash12(c + 46.) - .5)*1.8;
    for (int k = 0; k < 13; k++){
      float fk = float(k);
      if (fk >= N) break;
      float hk = hash12(c + fk*1.37 + 50.);
      float len = R*(.5 + .5*hk);
      if (r > len) continue;
      float tt = r/len;
      float th = fk/N*6.2832 + hk*.6 + bend*tt*tt + .2*sin(tt*6. + hk*7.);
      float da = abs(mod(a - th + PI, 2.*PI) - PI);
      float w = max(.0055*(1. - tt*.65)*(.35 + .65*abs(sin(tt*24. + hk*9.))), .0011);
      float cov = ss(w + px, w - px*.5, da*r)*.92;
      vec3 col = mix(vec3(.06, .15, .05), vec3(.22, .38, .10), tt*(.6 + .5*hk));
      acc.rgb = mix(acc.rgb, col, cov);
      acc.a = max(acc.a, cov);
      tip = max(tip, tt*cov);
    }
  }
  return acc;
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes, p = toWorld(uv);
  vec3 peb, pb2;
  vec4 T = terrain(p, peb);
  float e = 1.2/uRes.y;
  float hx = terrain(p + vec2(e, 0.), pb2).x, hy = terrain(p + vec2(0., e), pb2).x;
  vec3 n = normalize(vec3(-(hx - T.x)*KH/e, -(hy - T.x)*KH/e, 1.));
  float h = T.x;
  // soft shadows from the rocks: march toward the sun through the height field
  vec2 dir = normalize(LSUN.xy);
  float slope = LSUN.z/length(LSUN.xy), vis = 1.;
  for (int i = 1; i <= 12; i++){
    float t = float(i)*.0045;
    float hq = rocksOnly(p + dir*t);
    vis = min(vis, clamp(1. + (h*KH + t*slope - hq*KH)/(.006 + t*.12), 0., 1.));
  }
  float ndl = max(dot(n, LSUN), 0.);
  bool rock = T.y > .5;
  vec3 c = lin(rock ? rockCol(p, T.z, h, n) : floorCol(p, h, peb));
  float ao = rock ? mix(.55, 1., ss(.0, .5, T.w)) : 1.;
  if (h > WL) c *= vec3(.30, .34, .40)*ao + SUNC*1.15*ndl*vis;
  o0 = vec4(sqrt(clamp(c, 0., 1.)), h);
  float tip;
  vec4 pl = plants(p, tip);
  pl.a *= ss(.025, .06, WL - h)*(rock ? .25 : 1.);
  o1 = vec4(sqrt(pl.rgb/max(pl.a, .001)), pl.a);
  o2 = vec4(ss(-.25, .0, shoreBand(p)), clamp(ndl*vis/LSUN.z/1.5, 0., 1.), tip, ao);
}
`;
