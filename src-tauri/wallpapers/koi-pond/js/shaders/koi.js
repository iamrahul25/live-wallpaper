/*
 * shaders/koi.js — koi bodies and their shadows.
 *
 * Each koi is a triangle strip built on the CPU (koi-mesh.js). aUV = (u along the body 0 nose .. 1 tail,
 * s across it), aLat = the sideways direction. The fragment shader cuts the silhouette (body, pectoral,
 * pelvic and tail fins) and paints the variety pattern.
 *
 * Defines: VS_FISH     uMode 0 = colour, 1 = shadow on the pond floor (offset away from the sun)
 *          FISH_SHAPE  bodyW() body width profile and fin shapes, shared by both modes
 *          FS_FISH     koiColour() varieties (uVar): 0 kohaku, 1 orange ogon, 2 sanke, 3 tancho,
 *                      4 yamabuki, 5 hariwake, 6 showa; scales, fins, lighting, water tint by depth
 * Keep bodyW() in sync with bodyWjs() in koi.js.
 */
"use strict";

/* ---------- koi ---------- */
const VS_FISH = `
in vec2 aPos; in vec2 aUV; in vec2 aLat;
uniform int uMode;            // 0 colour, 1 shadow on the floor
uniform sampler2D uBed;
uniform vec2 uFishC;
uniform float uZ, uL;
out vec2 vUV; out vec2 vLat; out float vSoft; out float vDark;
void main(){
  vec2 off = vec2(0.);
  vSoft = 0.; vDark = 0.;
  if (uMode == 1){
    float D = max((WL - texture(uBed, toUV(uFishC)).a)*KD, uZ + .012);
    float hab = D - uZ;                              // height above the floor
    off = -LSUN.xy/LSUN.z*hab;
    vSoft = (.004 + hab*.065)/uL;
    vDark = .70*(1. - .4*ss(0., .22, hab));
  }
  vUV = aUV; vLat = aLat;
  gl_Position = toClip(aPos + off);
}
`;
const FISH_SHAPE = `
uniform float uPhase, uAmp, uFinL, uFinR, uPel, uSpread, uFlut;
float bodyW(float u){
  float t = clamp(u/.84, 0., 1.);
  return max(.205*pow(t, .42)*pow(1. - t, .62), .021*ss(.60, .72, u)*ss(.905, .84, u));
}
float smax(float a, float b, float k){ float h = max(k - abs(a - b), 0.)/k; return max(a, b) + h*h*k*.25; }
float finFan(vec2 q, vec2 b, float phi, float l, float wd, float aa, out float ray){
  vec2 d = q - b, dir = vec2(cos(phi), sin(phi));
  float x = dot(d, dir), y = dot(d, vec2(-dir.y, dir.x));
  float xn = x/l;
  y += .06*wd*sin(xn*7. - uFlut)*xn;                 // the trailing edge ripples
  float tw = wd*(.38 + .62*ss(0., .55, xn));
  float dist = (length(vec2((x - .5*l)/(.5*l), y/tw)) - 1.)*min(.5*l, tw);
  ray = .78 + .22*sin(atan(y, x + .2*l)*34.);
  return ss(aa, -aa, dist);
}
float tailFin(vec2 q, float aa, out float ray){
  float X = q.x - .79, Y = abs(q.y);
  float hw = (.020 + X*.86)*uSpread;
  float endX = .12 + .085*pow(clamp(Y/(.165*uSpread), 0., 1.), 1.5);
  ray = .76 + .24*sin(atan(q.y, X + .06)*30.);
  return ss(aa, -aa, smax(Y - hw, X - endX, .02))*ss(-.015, .01, X);
}
`;
const FS_FISH = FISH_SHAPE + `
in vec2 vUV; in vec2 vLat; in float vSoft; in float vDark;
uniform int uMode;
uniform float uL, uSeed, uVar, uDepth, uZ;
uniform sampler2D uCaus, uSurf;
out vec4 o;

vec3 koiColour(float u, float s, float soft, out float metal, out vec3 finTint){
  vec2 pc = vec2(u*4.6, s*7.5) + uSeed*13.7;
  float n = fbm(pc, 4), n2 = fbm(pc*1.9 + 5.1, 3);
  float e = .022 + soft;
  float bias = -.32*ss(.10, .02, u) - .45*ss(.70, .80, u) + .05;   // white nose and tail root
  vec3 W = vec3(.86, .85, .81), Rd = vec3(.74, .060, .014), Bk = vec3(.010, .010, .012);
  vec3 Or = vec3(1., .27, .018), Gd = vec3(1., .56, .07), Pt = vec3(.80, .81, .80);
  vec3 c = W; metal = 0.; finTint = W;
  if (uVar < .5){                                     // kohaku
    c = mix(W, Rd, ss(.5 - e, .5 + e, n + bias));
  } else if (uVar < 1.5){                             // orange ogon
    c = Or*(.82 + .32*n2); metal = 1.; finTint = Or;
  } else if (uVar < 2.5){                             // taisho sanke
    c = mix(W, Rd, ss(.52 - e, .52 + e, n + bias));
    float sp = ss(.66 - e, .66 + e, fbm(pc*2.6 + 9., 3) + .08*ss(.2, .5, u) - .3*ss(.2, .1, u));
    c = mix(c, Bk, sp*.95);
  } else if (uVar < 3.5){                             // tancho
    float d = length((vec2(u, s) - vec2(.095, 0.))*vec2(1., 1.1)) - .052;
    c = mix(Rd, W, ss(-e*.4, e*.4, d));
  } else if (uVar < 4.5){                             // yamabuki ogon
    c = Gd*(.86 + .26*n2); metal = 1.; finTint = Gd;
  } else if (uVar < 5.5){                             // hariwake
    c = mix(Pt, Or*.95 + .03, ss(.52 - e, .52 + e, n + bias)); metal = 1.; finTint = mix(Pt, Or, .35);
  } else {                                            // showa
    c = mix(Bk, Rd, ss(.48 - e, .48 + e, n + bias*.5));
    c = mix(c, W, ss(.6 - e, .6 + e, n2 + .1*ss(.5, .9, u)));
    finTint = mix(W, Bk, .3);
  }
  return c;
}

void main(){
  vec2 q = vUV;
  float u = q.x, s = q.y;
  float px = fwidth(s);
  float rows = u/.030;
  float fwr = fwidth(rows);
  float rp, rv, rt;
  vec2 qm = vec2(u, abs(s));
  float pp = s > 0. ? uFinR : uFinL;
  if (uMode == 1){
    float aa = px + vSoft;
    float sil = max(ss(aa, -aa, abs(s) - bodyW(u)),
                max(finFan(qm, vec2(.215, bodyW(.215)*.70), pp, .150, .050, aa, rp)*.7, tailFin(q, aa, rt)*.65));
    o = vec4(vDark*sil, 0., 0., 1.);
    return;
  }
  float aa = px*1.15 + uDepth*.010;
  float bw = bodyW(u);
  float body = ss(aa, -aa, abs(s) - bw);
  float pec  = finFan(qm, vec2(.215, bodyW(.215)*.70), pp, .150, .050, aa, rp);
  float pel  = finFan(qm, vec2(.535, bodyW(.535)*.55), uPel, .082, .026, aa, rv);
  float tail = tailFin(q, aa, rt);
  // dorsal fin seen edge-on: a thin line along the back that flops with the stroke
  float du = (u - .33)/.33, dors = 0.;
  if (du > 0. && du < 1.){
    float off = uAmp*.30*sin(uPhase - 5.3*u)*du;
    float dw = .0065*pow(sin(PI*du), .6) + aa*.3;
    dors = ss(dw + aa, dw - aa*.5, abs(s - off))*.55;
  }
  // fins are thin: fairly solid at the root, glassy toward the edges
  float fin = 1. - (1. - pec*rp*.60)*(1. - pel*rv*.50)*(1. - tail*rt*(.58 - .30*ss(.03, .20, u - .79)));
  float a = body + fin*(1. - body);
  if (a < .003) discard;

  float metal; vec3 finTint;
  vec3 alb = koiColour(u, s, uDepth*.10, metal, finTint);

  vec2 suv = gl_FragCoord.xy/uRes;
  vec4 cs = DEC_C(texture(uCaus, suv));
  float sunM = DEC_S(texture(uSurf, suv)).w;
  float direct = mix(.55*sunM, cs.a, .65);            // dancing light on the koi's back

  // body normal: round across the back, sloping down at the nose and toward the tail
  float qn = clamp(s/max(bw, 1e-3), -1., 1.);
  vec2 fwd = vec2(vLat.y, -vLat.x);
  float headS = .55*ss(.13, .0, u) - .25*ss(.62, .84, u);
  vec3 N = normalize(vec3(vLat*qn*.95 + fwd*headS, sqrt(max(1. - qn*qn*.85, .08))));
  alb *= 1. - .30*metal*qn*qn;                         // metallic koi shine brightest along the spine
  // scales: each one tilts a little, so they glint as the body flexes and turns
  float scaleVis = ss(.55, .25, fwr)*ss(.15, .22, u)*(1. - uDepth);
  vec3 Ns = N;
  float rim = 0.;
  if (scaleVis > .01){
    float ri = floor(rows);
    float cc = s/.028 + .5*mod(ri, 2.);
    vec2 cell = vec2(fract(rows), fract(cc)) - .5;
    rim = ss(.28, .48, length(cell*vec2(1.25, 1.)))*scaleVis;
    vec2 tl = (hash22(vec2(ri, floor(cc)) + uSeed*7.) - .5)*.5*scaleVis;
    Ns = normalize(N + vec3(vLat*tl.x + fwd*tl.y, 0.));
  }
  float ndl = max(dot(N, LSUN), 0.);
  vec3 lightC = AMB*1.3 + SUNC*direct*ndl*1.3;
  float spec = pow(max(dot(Ns, normalize(LSUN + vec3(0., 0., 1.))), 0.), mix(55., 22., metal))*mix(.30, 1.1, metal);
  vec3 bodyC = alb*lightC*(1. - .12*rim*(1. + metal));
  bodyC += mix(SUNC, alb*1.6 + .1, metal)*spec*direct*1.4;
  bodyC *= .42 + .58*sqrt(max(1. - qn*qn, 0.));          // the flanks curve away from the light
  bodyC *= 1. - .22*ss(.80, 1., abs(qn));
  // eyes, set on the sides of the head
  float eye = ss(1.1, .7, length(vec2((u - .072)/.012, (abs(s) - bodyW(.072)*.84)/.012)));
  bodyC = mix(bodyC, vec3(.012), eye*.85);
  bodyC = mix(bodyC, finTint*lightC*.8 + SUNC*.04, dors);
  vec3 finC = finTint*(AMB*1.4 + SUNC*direct*.75);
  vec3 c = (bodyC*body + finC*fin*(1. - body))/a;
  // water between the koi and the surface
  vec3 Tf = exp(-SIG*.62*(uZ + .012));
  c = c*Tf + WATER*(.6 + .6*sunM)*(1. - Tf);
  o = vec4(c*a, a);
}
`;
