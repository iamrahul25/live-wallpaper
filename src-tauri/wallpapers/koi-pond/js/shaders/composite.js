/*
 * shaders/composite.js — final full-screen pass to the canvas.
 *
 * Combines the baked floor (refracted by the surface), plants, caustics, floor shadows, the koi layer,
 * water absorption, sky/garden reflection and sun glints, then grade().
 *
 * Defines: FS_COMP
 */
"use strict";

/* ---------- final composite ---------- */
const FS_COMP = `
uniform sampler2D uBedA, uVeg, uInfo, uCaus, uSurf, uShadow, uFish;
out vec4 o;
vec2 micro(vec2 p, float t){
  vec2 g = vec2(0.);
  for (int i = 0; i < 5; i++){
    float fi = float(i), ang = fi*2.4 + 1.1;
    vec2 d = vec2(cos(ang), sin(ang));
    float k = 6.2832/(.011 + fi*.003);
    g += d*cos(dot(d, p)*k - t*(1.9 + fi*.3) + fi*2.7);
  }
  return g*.0045;
}
vec3 skyEnv(vec3 R, float occ){
  // a garden pond mostly mirrors trees and shade; the sky only shows dimly through them
  vec3 s = mix(vec3(.30, .40, .42), vec3(.18, .30, .40), ss(.55, 1., R.z));
  vec2 cp = R.xy/max(R.z, .25)*1.4 + vec2(uTime*.003, uTime*.001);
  s = mix(s, vec3(.50, .55, .55), ss(.50, .85, fbm(cp*2.2 + 3., 4))*.35);   // faint, slow clouds
  s = mix(s, vec3(.05, .10, .07), .22*fbm(cp*.9 + 11., 3));                  // foliage in the reflection
  return mix(s, vec3(.020, .045, .024), occ);          // the garden around the pond
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes, p = toWorld(uv);
  vec4 b0 = texture(uBedA, uv);
  float H = b0.a;
  float wet = ss(WL + .004, WL - .002, H);
  vec4 sf = DEC_S(texture(uSurf, uv));
  float sunM = clamp(sf.w, 0., 1.2);
  vec2 g = sf.xy + micro(p, uTime)*mix(.45, 1., ss(.1, .9, p.x));
  float D = max(WL - H, 0.)*KD;
  // refraction: the floor (and the koi) wobble with the surface
  vec2 offW = -g*(D*.6 + .005);
  vec2 uvR = uv + vec2(offW.x/uA, -offW.y);
  vec4 bR = texture(uBedA, uvR);
  if (bR.a > WL - .002){ uvR = uv; bR = b0; }
  vec4 inf = texture(uInfo, uvR);
  vec2 sw = inf.b*vec2(sin(uTime*.55 + p.y*11. + p.x*3.)*.0045 + sin(uTime*1.3 + p.x*23.)*.0012,
                       cos(uTime*.47 + p.x*9. + p.y*4.)*.004);              // plants sway
  vec4 veg = texture(uVeg, uvR + vec2(sw.x/uA, -sw.y));
  vec4 cs = DEC_C(texture(uCaus, uvR));
  float shd = texture(uShadow, uvR).r;
  float ambK = .70 + .30*clamp(sunM, 0., 1.);
  vec3 Lb = AMB*ambK*(.6 + .4*inf.a) + SUNC*cs.rgb*inf.g*1.65*(1. - shd);
  vec3 bed = sq(bR.rgb)*Lb;
  vec3 vc = sq(veg.rgb)*(AMB*ambK*.95 + SUNC*cs.g*(1. - shd)*.9);
  bed = mix(bed, vc, veg.a);
  vec3 T = exp(-SIG*max(WL - bR.a, 0.)*KD);
  vec3 col = (bed*T + WATER*vec3(.75, 1.05, 1.15)*(.50 + .62*sunM)*(1. - T))*.95;   // deeper, clearer teal
  vec4 fs = texture(uFish, uv + vec2(offW.x/uA, -offW.y)*.45);
  col = col*(1. - fs.a) + fs.rgb;
  // surface: sky and garden reflections, sun glints
  vec3 N = normalize(vec3(-g, 1.));
  vec3 V = normalize(vec3(uA*.5 - p.x, .5 - p.y, CAMH));
  float F = .02 + .98*pow(1. - clamp(dot(N, V), 0., 1.), 5.);
  float occ = clamp(max(canopyCover(p)*.9, texture(uInfo, uv).r*.75), 0., 1.);
  col = mix(col, skyEnv(reflect(-V, N), occ), clamp(F*1.3, 0., .5));   // seen from above: weak reflection
  float ndh = max(dot(N, normalize(LSUN + V)), 0.);
  col += SUNC*(pow(ndh, 160.)*.06 + pow(ndh, 1600.)*3.5)*sunM*(1. - occ*.6);   // small sharp sparkles, no milky sheen
  col += vec3(.03, .045, .04)*ss(WL - .03, WL - .004, H)*(.6 + .8*sunM);   // meniscus at the stones
  col = mix(sq(b0.rgb)*(.85 + .15*uSunI), col, wet);
  o = vec4(grade(col, p, gl_FragCoord.xy), 1.);
}
`;
