/*
 * shaders/common.js — GLSL shared by every shader program, and the full-screen triangle.
 *
 * gl.js program() prepends: "#version 300 es" + (LDR ? "#define LDR" : "") + COMMON
 * to both the vertex and the fragment source of every program.
 *
 * Defines: COMMON   uniforms uA (aspect), uTime, uSunI (sun intensity), uCalm, uRes; scene constants
 *                   (WL waterline height, KD depth scale, CAMH camera height, sun LSUN/SUNC, water SIG/WATER/AMB);
 *                   noise (hash12, hash22, vnoise, fbm), shoreBand(), canopyCover(), coordinate helpers
 *                   (toUV, toWorld, toClip), ENC_C/ENC_S, DEC_C/DEC_S (pack HDR values when float targets are missing),
 *                   grade() final tone-mapping/colour grade
 *          VS_FULL  full-screen triangle vertex shader (draw 3 vertices, no buffers)
 *
 * World coordinates: x in [0, uA] (left to right), y in [0, 1] (top to bottom); 1 unit = screen height.
 * shoreBand() here must match the JS copy in world.js (the koi steer with it).
 */
"use strict";

const COMMON = `
precision highp float;
precision highp int;
precision highp sampler2D;
uniform float uA, uTime, uSunI, uCalm;
uniform vec2 uRes;
#define WL .56
#define KD .55
#define CAMH 1.6
#define PI 3.14159265
const vec3 LSUN  = vec3(.300, -.340, .891);
const vec3 SUNC  = vec3(1., .92, .78);
const vec3 SIG   = vec3(10.5, 3.1, 3.6);
const vec3 WATER = vec3(.0050, .046, .043);
const vec3 AMB   = vec3(.24, .31, .31);
float ss(float a, float b, float x){ float t = clamp((x - a)/(b - a), 0., 1.); return t*t*(3. - 2.*t); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p, int oct){ float s = 0., a = .5, n = 0.;
  for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a*vnoise(p); n += a; p = mat2(1.6, 1.2, -1.2, 1.6)*p + 3.7; a *= .5; }
  return s/n; }
float wob(float t, float s){ return sin(t*1.7 + s)*.5 + sin(t*4.3 + s*2.1)*.3 + sin(t*9.1 + s*3.7)*.2; }
// > 0 inside the rocky margin (right edge, and the right part of the top and bottom edges)
float shoreBand(vec2 p){
  float r = p.x - (uA - (.105 + .035*wob(p.y*3., 1.) + .06*ss(.35, 0., p.y) + .07*ss(.62, 1., p.y)));
  float rt = ss(uA*.5, uA*.78, p.x), rb = ss(uA*.42, uA*.72, p.x);
  float t = (.055 + .03*wob(p.x*2.5, 4.))*rt - p.y - .1*(1. - rt);
  float b = p.y - (1. - (.06 + .03*wob(p.x*2.2, 7.))*rb) - .1*(1. - rb);
  return max(r, max(t, b));
}
// a maple on the left bank shades that side of the pond (keeps it calm behind the icons)
float canopyCover(vec2 p){ return ss(.64, .06, p.x + .10*sin(p.y*2.6 + .8) - .07*ss(.45, 0., p.y)); }
vec2 toUV(vec2 p){ return vec2(p.x/uA, 1. - p.y); }
vec2 toWorld(vec2 uv){ return vec2(uv.x*uA, 1. - uv.y); }
vec4 toClip(vec2 p){ return vec4(p.x/uA*2. - 1., 1. - 2.*p.y, 0., 1.); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 sq(vec3 c){ return c*c; }
#ifdef LDR
#define ENC_C(v) ((v)*.25)
#define DEC_C(v) ((v)*4.)
#define ENC_S(v) vec4((v).xy*4. + .5, (v).z*.25 + .5, (v).w)
#define DEC_S(v) vec4(((v).xy - .5)*.25, ((v).z - .5)*4., (v).w)
#else
#define ENC_C(v) (v)
#define DEC_C(v) (v)
#define ENC_S(v) (v)
#define DEC_S(v) (v)
#endif
vec3 aces(vec3 x){ return clamp((x*(2.51*x + .03))/(x*(2.43*x + .59) + .14), 0., 1.); }
vec3 grade(vec3 c, vec2 p, vec2 fc){
  float lc = uCalm*(1. - ss(.10, .72, p.x));            // calmer, darker, softer on the left
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(c, vec3(l), .18*lc)*(1. - .22*lc);
  c = aces(c*1.6);
  vec2 q = fc/uRes - .5;
  c *= 1. - .34*dot(q, q);
  c = pow(c, vec3(1./2.2));
  return c + (hash12(fc + fract(uTime*.37)*97.) - .5)/255.;
}
`;

const VS_FULL = `void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p*2. - 1., 0., 1.); }`;
