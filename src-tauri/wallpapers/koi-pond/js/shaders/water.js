/*
 * shaders/water.js — the water surface: ripple simulation and caustics.
 *
 * Defines: FS_SIM   height-field wave equation, ping-ponged between T.sim0/T.sim1 (r height, g previous).
 *                   Ripple sources (koi, drips, bubbles, food) arrive as uSrc[MAX_SRC] = (x, y, radius, strength).
 *          MAX_SRC  how many ripple sources one simulation step can take (simulation.js fills them)
 *          FS_CAUS  analytic wind waves + simulated ripples -> two outputs:
 *                   T.caus  caustic light on the floor (rgb) and softer caustics for the koi (a)
 *                   T.surf  surface slope (xy), ripple height (z), sunlight mask (w)
 */
"use strict";

/* ---------- ripple simulation ---------- */
// 14 koi use up to 28 sources (head wake + tail stroke each) and a handful of food can add ~13 more at
// once. WebGL2 guarantees 224 fragment uniform vectors, so 64 is safe. The shader loop stops at uNSrc,
// so unused slots cost nothing.
const MAX_SRC = 64;
const FS_SIM = `
uniform sampler2D uPrev, uBed;
uniform vec4 uSrc[${MAX_SRC}];
uniform int uNSrc;
uniform float uDamp;
out vec4 o;
void main(){
  ivec2 ip = ivec2(gl_FragCoord.xy), mx = ivec2(uRes) - 1;
  #define HT(dx, dy) texelFetch(uPrev, clamp(ip + ivec2(dx, dy), ivec2(0), mx), 0).r
  vec2 c = texelFetch(uPrev, ip, 0).rg;
  float lap = (4.*(HT(1, 0) + HT(-1, 0) + HT(0, 1) + HT(0, -1)) + HT(1, 1) + HT(-1, 1) + HT(1, -1) + HT(-1, -1) - 20.*c.r)/6.;
  float nh = (2.*c.r - c.g + .48*lap)*uDamp;
  vec2 uv = gl_FragCoord.xy/uRes, pw = toWorld(uv);
  for (int i = 0; i < ${MAX_SRC}; i++){
    if (i >= uNSrc) break;
    vec4 s = uSrc[i];
    vec2 d = pw - s.xy;
    nh += s.w*exp(-dot(d, d)/(s.z*s.z));
  }
  nh *= ss(WL + .012, WL - .004, texture(uBed, uv).a);            // stone banks reflect
  float edge = min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y));  // the pond goes on past the screen
  nh *= mix(.93, 1., ss(0., .035, edge));
  o = vec4(clamp(nh, -4., 4.), c.r, 0., 1.);
}
`;

/* ---------- surface slopes + caustics ---------- */
const FS_CAUS = `
uniform sampler2D uSim, uBed;
uniform vec2 uSimTex;
uniform float uRip, uCK;
layout(location = 0) out vec4 oC;   // rgb caustics on the floor, a: softer caustics near the surface (for koi)
layout(location = 1) out vec4 oS;   // xy surface slope, z ripple height, w sunlight mask
void waves(vec2 p, float t, out vec2 g, out vec3 hs){
  g = vec2(0.); hs = vec3(0.);
  float gust = .55 + .65*vnoise(p*1.3 + vec2(t*.05, -t*.035));
  for (int i = 0; i < 14; i++){
    float fi = float(i);
    float ang = fi*2.39996 + .4;
    vec2 d = vec2(cos(ang), sin(ang));
    float lam = .028*pow(1.17, fi);
    float k = 6.2832/lam;
    float ph = dot(d, p)*k - k*(.010 + .11*lam)*t + fi*1.7;
    const float sl = .020;
    g += d*(sl*cos(ph));
    hs += (-sl*k*sin(ph))*vec3(d.x*d.x, d.y*d.y, d.x*d.y);
  }
  g *= gust; hs *= gust;
}
float caus(vec3 hs, float F, float eps){
  float a = 1. + F*hs.x, b = 1. + F*hs.y, c = F*hs.z;
  float det = a*b - c*c;
  return 1./sqrt(det*det + eps);
}
float sunMask(vec2 p, float t){
  float cover = canopyCover(p);
  float l = 1.;
  if (cover > .002){
    vec2 sw = vec2(sin(t*.31)*.007 + sin(t*.83 + 1.3)*.0025, cos(t*.27)*.006 + sin(t*.71)*.002);
    float n = fbm((p + sw)*5.2 + 2., 5)*.62 + fbm((p + sw*1.8)*12. + 7., 3)*.38;
    l = mix(1., mix(.18, .95, ss(.55, .64, n)), cover);
  }
  l *= 1. - .10*ss(.45, .75, fbm(p*.7 + vec2(t*.008, t*.005), 3));   // slow, thin cloud shadows
  return l*uSunI;
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes, p = toWorld(uv);
  float D = max(WL - texture(uBed, uv).a, 0.)*KD;
  vec2 g; vec3 hs;
  waves(p, uTime, g, hs);
  float calm = mix(.6, 1., ss(.05, .85, p.x));
  g *= calm; hs *= calm;
  vec2 e = uSimTex;
  float h0 = texture(uSim, uv).r;
  float hxp = texture(uSim, uv + vec2(e.x, 0.)).r, hxm = texture(uSim, uv - vec2(e.x, 0.)).r;
  float hyp = texture(uSim, uv + vec2(0., e.y)).r, hym = texture(uSim, uv - vec2(0., e.y)).r;
  float hpp = texture(uSim, uv + e).r, hmm = texture(uSim, uv - e).r;
  float hpm = texture(uSim, uv + vec2(e.x, -e.y)).r, hmp = texture(uSim, uv + vec2(-e.x, e.y)).r;
  float dx = e.x*uA, dy = e.y;
  g  += uRip*vec2((hxp - hxm)/(2.*dx), -(hyp - hym)/(2.*dy));
  hs += uRip*vec3((hxp - 2.*h0 + hxm)/(dx*dx), (hyp - 2.*h0 + hym)/(dy*dy), -(hpp - hpm - hmp + hmm)/(4.*dx*dy));
  float F = min(D, .2)*uCK;
  float eps = .02 + D*D*4.;
  vec3 I = vec3(caus(hs, F*1.05, eps), caus(hs, F, eps), caus(hs, F*.95, eps));
  I = pow(I, vec3(1.15))*.82;
  float Is = caus(hs, F*.32 + .015*uCK, .03);
  float m = sunMask(p, uTime);
  oC = ENC_C(vec4(I*m, Is*m));
  oS = ENC_S(vec4(g, h0, m));
}
`;
