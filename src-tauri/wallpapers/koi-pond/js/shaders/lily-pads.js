/*
 * shaders/lily-pads.js — instanced lily pads (one quad per pad).
 *
 * Instance data (scene.js uploadScene): aP = x, y, radius, rotation; aQ = seed, notch angle, kind, age.
 * Defines: VS_PAD, FS_PAD   uMode 0 = pad on the surface, 1 = its shadow on the pond floor
 */
"use strict";

/* ---------- lily pads ---------- */
const VS_PAD = `
in vec2 aCorner; in vec4 aP; in vec4 aQ;         // P: x, y, radius, rotation   Q: seed, notch, kind, age
uniform int uMode;                               // 0 pad, 1 shadow on the floor
uniform sampler2D uSurf, uBed;
out vec2 vL; out vec4 vQ; out vec2 vW; out vec2 vTilt; out vec2 vLs; out vec2 vCS; out float vSoft;
void main(){
  float s = aQ.x, t = uTime;
  // anchored by a stem: slow wandering, a gentle sway, and a push from passing ripples
  vec2 c = aP.xy + aP.z*vec2(.10*sin(t*(.045 + .05*fract(s*7.31)) + s*11.) + .035*sin(t*(.30 + .1*fract(s*2.3)) + s*4.),
                              .10*sin(t*(.040 + .05*fract(s*3.17)) + s*5.3) + .035*cos(t*(.26 + .1*fract(s*4.1)) + s*6.));
  vec4 sf = DEC_S(texture(uSurf, toUV(c)));
  c -= sf.xy*.012;
  float rot = aP.w + .06*sin(t*(.03 + .05*fract(s*5.71)) + s*3.) + .015*sin(t*(.21 + .08*fract(s*9.1)) + s) + (sf.x - sf.y)*.25;
  float R = aP.z*(1. + sf.z*.02);
  vec2 l = aCorner*1.2;
  float cs = cos(rot), sn = sin(rot);
  vec2 w = c + vec2(cs*l.x - sn*l.y, sn*l.x + cs*l.y)*R;
  vSoft = 0.;
  if (uMode == 1){
    float D = max(WL - texture(uBed, toUV(c)).a, 0.)*KD;
    w += -LSUN.xy/LSUN.z*D;
    vSoft = (.004 + D*.07)/R;
  }
  gl_Position = toClip(w);
  vL = l; vQ = aQ; vW = w; vCS = vec2(cs, sn);
  vec2 gt = -sf.xy*2.5;
  vTilt = vec2(cs*gt.x + sn*gt.y, -sn*gt.x + cs*gt.y);
  vLs = vec2(cs*LSUN.x + sn*LSUN.y, -sn*LSUN.x + cs*LSUN.y);
}
`;
const FS_PAD = `
in vec2 vL; in vec4 vQ; in vec2 vW; in vec2 vTilt; in vec2 vLs; in vec2 vCS; in float vSoft;
uniform int uMode;
uniform sampler2D uSurf;
out vec4 o;
void main(){
  float seed = vQ.x, notch = vQ.y, kind = vQ.z, age = vQ.w;
  float r = length(vL), a = atan(vL.y, vL.x);
  float er = 1. - .022*vnoise(vec2(a*2.5 + seed*13., seed*7.)) - .012*sin(a*6. + seed*21.);
  float da = abs(mod(a - notch + PI, 2.*PI) - PI);
  float d = max(r - er, -(da*r - (.010 + .085*r*r)));          // round leaf with its V-shaped slit
  float fw = fwidth(d);
  if (uMode == 1){ float sft = vSoft + fw; o = vec4(.52*ss(sft, -sft, d), 0., 0., 1.); return; }
  float cov = ss(fw*1.1, -fw*1.1, d);
  float halo = ss(.20, .0, d)*(1. - cov)*.30;                    // the meniscus darkens the water at the rim
  if (cov + halo < .003) discard;
  float mt = fbm(vL*2.5 + seed*9., 4);
  vec3 base = mix(vec3(.06, .19, .045), vec3(.21, .38, .07), clamp(kind*1.25 + (mt - .5)*.7, 0., 1.));
  base = mix(base, vec3(.36, .15, .09), ss(.86, 1., kind)*.75);  // young bronze leaves
  float va = fract(a/(2.*PI)*24. + seed) - .5;
  base *= 1. + .28*ss(.07, .0, abs(va))*ss(.06, .25, r)*(1. - .5*r);   // radial veins
  base *= .84 + .32*fbm(vL*7. + seed*3., 3);
  float wear = ss(.60, .78, fbm(vL*3.5 + seed*5., 3))*age*ss(.3, .8, r);
  base = mix(base, vec3(.47, .40, .16), wear*.6);
  vec2 rd = vL/max(r, 1e-3);
  float rim = ss(er - .07, er - .015, r)*cov;                     // slightly upturned edge
  vec3 N = normalize(vec3(vTilt - rd*rim*.35, 1.));
  vec3 Ll = vec3(vLs, LSUN.z);
  base *= 1. - .30*rim*(.5 - .5*dot(rd, normalize(vLs)));       // the curled rim is darker away from the sun
  float sunM = clamp(DEC_S(texture(uSurf, toUV(vW))).w, 0., 1.2);
  vec3 col = lin(base)*(AMB*1.05 + SUNC*max(dot(N, Ll), 0.)*1.15*sunM);
  vec3 V = normalize(vec3(uA*.5 - vW.x, .5 - vW.y, CAMH));
  vec3 Vl = vec3(vCS.x*V.x + vCS.y*V.y, -vCS.y*V.x + vCS.x*V.y, V.z);
  // waxy sheen, broken up by the leaf's gentle undulation so it never washes the whole leaf out
  vec3 Nu = normalize(N + vec3((vec2(fbm(vL*3. + seed, 3), fbm(vL*3. + seed + 5., 3)) - .5)*.5, 0.));
  col += SUNC*pow(max(dot(Nu, normalize(Ll + Vl)), 0.), 160.)*.14*sunM*(1. - wear*.6);
  // a few water beads
  vec2 dq = vL*9. + seed*17., di = floor(dq), df = fract(dq) - .5;
  float dh = hash12(di + seed);
  if (dh > .955 && r < .82){
    vec2 dc = (hash22(di) - .5)*.4;
    float dr = length(df - dc)/(.10 + .12*fract(dh*31.));
    float drop = ss(1., .8, dr);
    col = mix(col, col*.5, drop*ss(.3, 1., dr));
    col += SUNC*1.4*ss(.32, .0, length(df - dc - normalize(vLs)*.05)/(.10 + .12*fract(dh*31.)))*drop*sunM;
  }
  col *= 1. - .25*ss(.05, .0, r);
  o = vec4(grade(col, vW, gl_FragCoord.xy)*cov, cov + halo*(1. - cov));
}
`;
