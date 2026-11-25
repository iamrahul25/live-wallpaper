/*
 * shaders/lotus.js — instanced lotus flowers and fallen petals.
 *
 * Instance data: aP = x, y, size, rotation; aQ = seed, openness, hue, height above the water.
 * Defines: VS_LOTUS, FS_LOTUS
 *   uMode 0 flower, 1 drop shadow on the water, 2 reflection, 3 fallen petal, 4 shadow on the floor
 */
"use strict";

/* ---------- lotus flowers, their shadows and reflections, fallen petals ---------- */
const VS_LOTUS = `
in vec2 aCorner; in vec4 aP; in vec4 aQ;         // P: x, y, size, rotation   Q: seed, openness, hue, height
uniform int uMode;                               // 0 flower, 1 shadow on water, 2 reflection, 3 fallen petal, 4 shadow on floor
uniform sampler2D uSurf, uBed;
out vec2 vL; out vec4 vQ; out vec2 vW; out vec2 vLs; out float vSoft; out vec2 vOff;
void main(){
  float s = aQ.x, t = uTime;
  vec2 sh = vec2(0.);
  vec2 c = aP.xy + aP.z*vec2(.10*sin(t*(.05 + .04*fract(s*7.3)) + s*9.) + .035*sin(t*.37 + s*5.),
                              .10*sin(t*(.045 + .05*fract(s*3.9)) + s*4.) + .035*cos(t*.31 + s*7.));
  vec4 sf = DEC_S(texture(uSurf, toUV(c)));
  c -= sf.xy*.008;
  float rot = aP.w + .035*sin(t*.21 + s*6.) + .018*sin(t*.53 + s*2.);
  if (uMode == 3){ c += aP.z*1.5*vec2(sin(t*.07 + s), cos(t*.06 + s*2.)); rot = aP.w + .25*sin(t*.05 + s*3.); }
  vec2 l = aCorner*1.1;
  vSoft = 0.;
  if (uMode == 1){ sh = -LSUN.xy/LSUN.z*aQ.w*1.6; c += sh; l *= 1.5; }   // drop shadow, away from the sun
  if (uMode == 2){ c += (c - vec2(uA*.5, .5))*(2.*aQ.w/CAMH) + sf.xy*.05; }
  if (uMode == 4){
    float D = max(WL - texture(uBed, toUV(c)).a, 0.)*KD;
    c += -LSUN.xy/LSUN.z*(D + aQ.w);
    vSoft = .2 + D*2.;
    l *= 1.3;
  }
  float cs = cos(rot), sn = sin(rot);
  vec2 w = c + vec2(cs*l.x - sn*l.y, sn*l.x + cs*l.y)*aP.z;
  gl_Position = toClip(w);
  vL = l; vQ = aQ; vW = w;
  vLs = vec2(cs*LSUN.x + sn*LSUN.y, -sn*LSUN.x + cs*LSUN.y);
  vOff = vec2(cs*sh.x + sn*sh.y, -sn*sh.x + cs*sh.y)/aP.z;     // shadow quad -> flower-centred coords
}
`;
const FS_LOTUS = `
in vec2 vL; in vec4 vQ; in vec2 vW; in vec2 vLs; in float vSoft; in vec2 vOff;
uniform int uMode;
out vec4 o;
// A lotus seen from above: up to three rings of broad, cupped, overlapping petals around a seed pod
// ringed with stamens. Every petal is a little different (seeded) and the inner rings shade the outer.
vec4 ringP(int i, float seed, float open){          // petals, length, width, angle offset
  float o0 = seed*2.1;
  if (i == 0) return vec4(8., mix(.34, .47, open), .44, o0);
  if (i == 1) return vec4(9., mix(.56, .80, open), .38, o0 + .35);
  return vec4(10., 1., .32, o0 + .17);
}
float ringTilt(int i, float open){ return i == 0 ? mix(1.30, 1.05, open) : i == 1 ? mix(1.05, .66, open) : .34; }
vec2 squash(vec2 q, float seed){                    // no flower is perfectly round
  return q*vec2(1. + .08*(hash12(vec2(seed, 1.3)) - .5), 1. + .08*(hash12(vec2(seed, 7.9)) - .5));
}
// petal k of a ring: a broad oval with a soft point at the tip. edge > 0 inside.
void petalAt(vec2 q, float k, vec4 P, float lay, float seed, out vec2 dir, out float t, out float yn, out float edge, out float L){
  float n = P.x, kk = mod(k, n), sp = 2.*PI/n;
  float j1 = hash12(vec2(kk*1.37 + lay*7.1, seed)), j2 = hash12(vec2(kk*2.91 + lay*3.3, seed + 4.)), j3 = hash12(vec2(kk*.73 + lay*5.9, seed + 9.));
  float th = P.w + k*sp + (j1 - .5)*sp*.32 + .02*sin(uTime*.55 + kk*1.7 + seed*5. + lay*2.);   // petals stir
  L = P.y*(.88 + .22*j2)*(1. + .012*sin(uTime*.42 + kk*2.3 + lay*1.3 + seed*3.));
  dir = vec2(cos(th), sin(th));
  float x = dot(q, dir), y = dot(q, vec2(-dir.y, dir.x));
  t = x/L;
  float tc = clamp(t, 0., 1.);
  float hw = P.z*(.86 + .28*j3)*L*pow(tc, .55)*pow(1. - tc, .7)/.424;   // broad, rounded, softly pointed
  edge = (t <= 0. || t >= 1.) ? -1. : hw - abs(y);
  yn = y/max(hw, 1e-4);
}
float ringCov(vec2 q, float blur, vec4 P, float lay, float seed){
  float kf = (atan(q.y, q.x) - P.w)/(2.*PI/P.x), ka = floor(kf + .5), kb = ka + (fract(kf + .5) > .5 ? 1. : -1.);
  vec2 d; float t, yn, e, e2, L;
  petalAt(q, ka, P, lay, seed, d, t, yn, e, L);
  petalAt(q, kb, P, lay, seed, d, t, yn, e2, L);
  return ss(-blur, blur, max(e, e2));
}
vec3 petalCol(float t, float yn, vec2 dir, float tilt, float hue, float seed, float kk, float lay){
  vec2 per = vec2(-dir.y, dir.x);
  // creamy white at the base, blushing pink toward the tip and the rims
  // like a real pink lotus: near-white low on the petal, clear pink on the outer half, rose at the tip and edges
  float blush = (ss(.16, .78, t) + .35*ss(.55, 1., abs(yn))*ss(.15, .7, t))*(.85 + .3*hue);
  vec3 c = mix(vec3(.99, .95, .92), vec3(.95, .58, .74), ss(.0, .75, blush));
  c = mix(c, vec3(.86, .30, .55), ss(.75, 1.2, blush)*.7);
  c = mix(c, vec3(.84, .30, .54), ss(.84, .99, abs(yn))*ss(.15, .55, t)*.32);     // a rosy rim defines each petal
  float vein = ss(.88, 1., abs(cos(yn*PI*3.5 + .35*sin(t*4. + kk))))*(.6 + .4*vnoise(vec2(yn*6., t*3.) + kk));   // a few soft veins
  c = mix(c, c*vec3(.95, .86, .90), vein*ss(.15, .5, t)*.35);
  c *= .95 + .08*vnoise(vec2(t*8., yn*3.) + seed + kk*3.1);
  // a curved trough rising toward its tip; the inner rings stand more upright
  float tl = tilt*(.55 + .75*t);
  vec3 N = normalize(vec3(-dir*sin(tl) - per*yn*.65*(1. - .4*t), cos(tl)));
  vec3 Ll = vec3(vLs, LSUN.z);
  float ndl = dot(N, Ll);
  float diff = pow(clamp(ndl*.6 + .4, 0., 1.), 1.5);                              // soft, wrapped light
  float thin = ss(.6, 1., abs(yn))*.5 + ss(.65, 1., t)*.5;
  vec3 col = lin(c)*(AMB*1.0 + SUNC*.80*diff);
  col += lin(vec3(1., .55, .70))*SUNC*(thin*.15 + max(-ndl, 0.)*.38);            // sun glowing through the thin petal
  col *= mix(.50, 1., ss(.0, .38, t));                                            // deep inside, the base is in shade
  col += SUNC*pow(max(dot(N, normalize(Ll + vec3(0., 0., 1.))), 0.), 28.)*.03;    // faint waxy sheen
  return col;
}
vec4 ring(vec2 q, float px, int li, float seed, float open, float hue){
  vec4 P = ringP(li, seed, open);
  float lay = float(li), tilt = ringTilt(li, open);
  if (length(q) > P.y*1.12) return vec4(0.);
  float kf = (atan(q.y, q.x) - P.w)/(2.*PI/P.x);
  float ka = floor(kf + .5), kb = ka + (fract(kf + .5) > .5 ? 1. : -1.);
  // every petal has its own place in the overlap: some lie over both neighbours, some under
  bool aFront = hash12(vec2(mod(ka, P.x), lay + seed*.37)) > hash12(vec2(mod(kb, P.x), lay + seed*.37));
  float kF = aFront ? ka : kb, kB = aFront ? kb : ka;
  vec2 dF, dB; float tF, tB, yF, yB, eF, eB, LF, LB;
  petalAt(q, kF, P, lay, seed, dF, tF, yF, eF, LF);
  petalAt(q, kB, P, lay, seed, dB, tB, yB, eB, LB);
  float cF = ss(-px, px, eF), cB = ss(-px, px, eB);
  vec4 res = vec4(0.);
  if (cF > 0.) res = vec4(petalCol(tF, yF, dF, tilt, hue, seed, mod(kF, P.x), lay)*cF, cF);
  if (cB > 0. && res.a < .999){
    vec3 cb = petalCol(tB, yB, dB, tilt, hue, seed, mod(kB, P.x), lay);
    cb *= 1. - .55*ss(-.10*LF, 0., eF);                                           // soft shadow along the front petal's edge
    res += (1. - res.a)*vec4(cb*cB, cB);
  }
  return res;
}
vec4 flower(vec2 q, float px, float seed, float open, float hue){
  q = squash(q, seed);
  float r = length(q), a = atan(q.y, q.x);
  vec3 Ll = vec3(vLs, LSUN.z);
  vec2 toSun = vLs/LSUN.z;
  float showC = ss(.55, .8, open);
  vec4 acc = vec4(0.);
  if (showC > 0.){
    // seed pod: a flat-topped, yellow-green cone dotted with seed sockets
    const float PR = .15;
    float pod = ss(PR + px, PR - px, r)*showC;
    if (pod > 0.){
      float s1 = 2.*PI/6., s2 = 2.*PI/11., aa = a - seed;
      float i1 = floor(aa/s1 + .5)*s1 + seed, i2 = floor((aa - .3)/s2 + .5)*s2 + seed + .3;
      vec2 d1 = q - .068*vec2(cos(i1), sin(i1)), d2 = q - .118*vec2(cos(i2), sin(i2));
      vec2 dh = dot(d1, d1) < dot(d2, d2) ? d1 : d2;
      dh = dot(q, q) < dot(dh, dh) ? q : dh;
      float hl = length(dh), hole = ss(.018, .011, hl);
      vec3 N = normalize(vec3(q/PR*.9*ss(.55, 1., r/PR) - dh/.018*.5*ss(.024, .012, hl)*(1. - hole), 1.));
      vec3 pc = mix(vec3(.64, .82, .30), vec3(.46, .66, .22), ss(.08, .15, r));     // fresh yellow-green pod
      pc = mix(pc, vec3(.42, .40, .16), hole*.8);
      vec3 col = lin(pc)*(AMB*1.2 + SUNC*1.05*max(dot(N, Ll), 0.));
      acc = vec4(col*pod, pod);
    }
    // a dense ring of fine stamens with golden anthers at their tips
    float rOut = .29 + .03*(vnoise(vec2(a*7. + seed, seed)) - .5);   // a fluffy, uneven outer edge
    float st = ss(.135, .16, r)*ss(rOut + .02, rOut - .03, r)*showC;
    if (st > 0.){
      float sa = a*34. + sin(r*30. + seed)*.7 + seed;
      float fil = ss(.70, .97, abs(sin(sa)))*(.6 + .4*vnoise(vec2(a*40., r*20.) + seed));
      float anth = ss(.52, .78, vnoise(vec2(a*24. + seed*3., r*16.)))*ss(rOut - .09, rOut - .05, r);
      float cov = st*clamp(.42 + .5*fil + anth, 0., 1.);
      vec3 sc = mix(vec3(.97, .85, .46), vec3(.95, .68, .18), clamp(anth*1.3, 0., 1.));   // pale gold filaments, golden tips
      vec3 col = lin(sc)*(AMB*1.15 + SUNC*.9)*mix(.5, 1., ss(.15, .24, r));
      acc += (1. - acc.a)*vec4(col*cov, cov);
    }
  }
  float core = ss(.13, .09, r)*(1. - showC);                  // half-open: the petal tips meet in the middle
  if (core > 0.) acc += (1. - acc.a)*vec4(lin(vec3(.95, .80, .82))*(AMB + SUNC*.7)*(.6 + .4*ss(.0, .12, r))*core, core);
  vec4 P0 = ringP(0, seed, open), P1 = ringP(1, seed, open);
  vec4 c0 = ring(q, px, 0, seed, open, hue);
  c0.rgb *= mix(.60, 1., ss(.10, .32, r));                     // shaded by the pod and stamens
  acc += (1. - acc.a)*c0;
  vec4 c1 = ring(q, px, 1, seed, open, hue);                   // shadowed by the ring above it
  c1.rgb *= (1. - .45*ringCov(q + toSun*.10, .05, P0, 0., seed))*mix(.66, 1., ss(P0.y*.5, P0.y*1.05, r));
  acc += (1. - acc.a)*c1;
  vec4 c2 = ring(q, px, 2, seed, open, hue);
  c2.rgb *= (1. - .40*ringCov(q + toSun*.08, .05, P1, 1., seed))*mix(.70, 1., ss(P1.y*.5, P1.y*1.05, r));
  acc += (1. - acc.a)*c2*ss(.5, .75, open);
  return acc;
}
float silhouette(vec2 q, float blur, float seed, float open){
  q = squash(q, seed);
  float s = max(ringCov(q, blur, ringP(1, seed, open), 1., seed), ss(.42 + blur, .30 - blur, length(q)));
  return max(s, ringCov(q, blur, ringP(2, seed, open), 2., seed)*ss(.5, .75, open));
}
void main(){
  float seed = vQ.x, open = vQ.y, hue = vQ.z;
  vec2 q = vL;
  float px = length(fwidth(q))*.8 + .002;
  if (uMode == 1){
    // drop shadow (this quad is shifted away from the sun) and a tight contact shadow around the flower
    float drop = silhouette(q, .12, seed, open);
    float contact = silhouette((q + vOff)*.88, .08, seed, open);
    o = vec4(0., 0., 0., 1. - (1. - .62*drop)*(1. - .40*contact));
    return;
  }
  if (uMode == 4){ o = vec4(.42*ss(1.1, .25, length(q)/(1. + vSoft*.3)), 0., 0., 1.); return; }
  if (uMode == 3){
    float t = q.x*.5 + .5;
    if (t <= 0. || t >= 1.) discard;
    float hw = .34*pow(sin(PI*pow(t, 1.15)), .8);
    float cov = ss(px, -px, abs(q.y) - hw);
    float shadow = ss(px*3., -px*3., abs(q.y + .09) - hw)*(1. - cov)*.28;
    if (cov + shadow < .003) discard;
    float yn = q.y/max(hw, 1e-3);
    vec3 c = mix(vec3(.98, .82, .87), vec3(.92, .50, .67), ss(.15, 1., t) + .3*abs(yn));
    vec3 col = lin(c)*(.62 + .38*(1. - yn*yn) + .2*dot(normalize(vec2(-yn, 1.)), vLs));
    o = vec4(grade(col, vW, gl_FragCoord.xy)*cov, cov + shadow);
    return;
  }
  vec4 f = flower(q, px, seed, open, hue);
  if (f.a < .003) discard;
  vec3 c = f.rgb/f.a*(.9 + .1*uSunI);
  float al = f.a;
  if (uMode == 2){ c *= .35; al *= .20; }
  o = vec4(grade(c, vW, gl_FragCoord.xy)*al, al);
}
`;
