/*
 * gl.js — WebGL2 setup, the composite shader, sizing and render().
 *
 * The canvas is exactly as many pixels as art cells are visible (418 x 235 at 16:9) and CSS scales it
 * up with image-rendering: pixelated, so every effect lands on the painting's own pixel grid. The
 * painting covers the screen; on other aspect ratios it is cropped around FOCUS (fire and float).
 *
 * The fragment shader, per art cell:
 *   1. erases the painted float (water.js draws a live one)
 *   2. lake: slides rows sideways by a cell or two (never across rocks), sparkles the moon path,
 *      dims it while a wisp covers the moon, makes the fire's reflection flicker
 *   3. flame: a 12 fps procedural flame in 4 colours over the painted one
 *   4. light: warm fire light that flickers on everything near it (6 dithered steps), the tent's
 *      glow, the moon's breathing halo (4 dithered steps), twinkling painted stars, blinking painted
 *      fireflies, low mist over the lake
 *   5. FX layer over it, GLOW layer added
 *
 * Defines: gl, lost, view, FOCUS, glInit(), resize(), render()
 * Uses:    sceneImg, maskImg, W, H (world.js), FX, GLOW (fx.js), drawAll (loop.js), state of every module
 */
"use strict";

let gl = null, prog = null, vao = null, lost = false;
const U = {}, TEX = {};
const view = { cols: W, rows: H, ox: 0, oy: 0, s: 1 };
// Where the crop sits when the screen's shape differs from the painting's, as a fraction of the
// cells that do not fit: 0 = keep the left / top edge, 1 = keep the right / bottom edge.
// Leaning up keeps the moon on ultrawide screens; leaning right keeps the fire and boy on tall ones.
const FOCUS = [0.6, 0.3];

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uScene, uMask, uFx, uGlow;
uniform ivec2 uOff;
uniform int uRows;
uniform float uT, uFire, uFlame, uTent, uMoon, uMoonFlash, uMoonDim, uMist, uRain, uWind;
out vec4 outColor;

const vec2 MOON = vec2(97.5, 35.0);
const vec2 FIRE_BASE = vec2(258.5, 173.0);
const vec2 FIRE_LIGHT = vec2(258.5, 168.0);

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float bayer(ivec2 c) {
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[(c.y & 3) * 4 + (c.x & 3)]) + 0.5) / 16.0;
}
// quantise 0..1 into n steps with ordered dithering between them
float steps(float v, float n, ivec2 c) { return floor(v * n + bayer(c)) / n; }
ivec2 cl(ivec2 c) { return clamp(c, ivec2(0), ivec2(417, 234)); }
vec3 scene(ivec2 c) { return texelFetch(uScene, cl(c), 0).rgb; }
vec4 maskAt(ivec2 c) { return texelFetch(uMask, cl(c), 0); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  ivec2 c = ivec2(uOff.x + f.x, uOff.y + (uRows - 1 - f.y));
  vec2 p = vec2(c) + 0.5;
  vec4 m = maskAt(c);
  bool water = m.r > 0.5, sky = m.g > 0.5;
  ivec2 s = c;

  // 1. the painted float is replaced by the live one
  if (c.x >= 207 && c.x <= 212 && c.y >= 159 && c.y <= 167) s = c - ivec2(7, 0);

  // 2. the lake: rows slide sideways, more in the foreground than near the far shore
  if (water) {
    float depth = clamp((p.y - 138.0) / 97.0, 0.0, 1.0);
    float amp = mix(0.55, 2.3, depth);
    float w = sin(p.y * mix(2.1, 1.1, depth) + uT * 1.25 + 2.5 * sin(p.y * 0.37 + uT * 0.45))
            + 0.55 * sin(p.x * 0.045 + p.y * 0.9 - uT * 0.8);
    ivec2 s2 = s + ivec2(int(floor(w * amp * 0.6 + 0.5)), 0);
    if (maskAt(s2).r > 0.5) s = s2;
  }
  vec3 col = scene(s);

  if (water) {
    float h = hash(vec2(c) + floor(uT * 6.0) * vec2(0.37, 0.71));
    if (col.b > 0.5 && lum(col) > 0.33) {             // the moon's path: sparkle and dim with the moon
      if (h < 0.22) col = mix(col, vec3(0.02, 0.09, 0.24), 0.6);
      else if (h > 0.94) col = min(col * 1.45 + 0.08, vec3(1.0));
      col = mix(col, vec3(0.02, 0.08, 0.22), 0.6 * uMoonDim);
    } else {
      // stray glints along the path
      float cx = 120.0 + (p.y - 140.0) * 0.02, hw = mix(5.0, 15.0, clamp((p.y - 138.0) / 90.0, 0.0, 1.0));
      if (abs(p.x - cx) < hw &&h > 0.985 - 0.01 * (1.0 - uMoonDim)) col += vec3(0.45, 0.6, 1.0) * 0.55 * (1.0 - uMoonDim);
    }
    if (col.r > col.b && col.r > 0.3) col *= 1.0 + (uFire - 1.0) * 1.6;   // the fire's reflection
  }

  // 3. flame
  vec2 q = p - FIRE_BASE;
  if (q.x > -8.0 && q.x < 8.0 && q.y > -26.0 && q.y < 0.0) {
    float tq = floor(uT * 12.0) / 12.0;
    float h = -q.y / (12.5 * uFlame);
    float n1 = noise(vec2(p.x * 0.55, p.y * 0.42 + tq * 9.0));
    float n2 = noise(vec2(p.x * 1.1 + 7.0, p.y * 0.8 + tq * 15.0));
    float sway = ((noise(vec2(tq * 1.7, p.y * 0.15)) - 0.5) * 2.4 + uWind * 1.4) * h;
    float wdt = 4.8 * pow(max(1.0 - h, 0.0), 0.75) * (0.8 + 0.4 * n1);
    float I = h > 1.0 ? -1.0 : (1.0 - abs(q.x - sway) / max(wdt, 0.01)) * (1.15 - h * 0.75) * (0.7 + 0.55 * n2);
    if (I > 0.82) col = vec3(1.0, 0.97, 0.80);
    else if (I > 0.6) col = vec3(1.0, 0.83, 0.35);
    else if (I > 0.38) col = vec3(0.99, 0.55, 0.15);
    else if (I > 0.18) col = vec3(0.80, 0.25, 0.08);
    else if (q.y < -1.0 && lum(col) > 0.4 && col.r > col.b * 1.8) col = mix(col, vec3(0.30, 0.10, 0.04), 0.75);
  }

  // 4. light
  if (!sky) {
    vec2 d = (p - FIRE_LIGHT) * vec2(1.0, 1.5);
    float fall = clamp(1.0 - length(d) / 72.0, 0.0, 1.0);
    float k = steps(fall * fall, 6.0, c) * (uFire - 1.0);
    col *= 1.0 + k * 1.7 * vec3(1.0, 0.8, 0.6);
    col += vec3(1.0, 0.5, 0.2) * max(k, 0.0) * 0.08;

    if (p.x > 333.0 && p.x < 392.0 && p.y > 98.0 && p.y < 162.0 && col.r > col.b * 1.6 && col.r > 0.3) col *= uTent;
    vec2 dt = (p - vec2(366.0, 152.0)) * vec2(1.0, 2.0);
    col *= 1.0 + (uTent - 1.0) * steps(clamp(1.0 - length(dt) / 42.0, 0.0, 1.0), 5.0, c) * 0.9;

    // painted fireflies blink too
    if (c.x < 200 && c.y > 90 && c.y < 190 && col.r > 0.35 && col.g > col.r * 0.72 && col.b < col.r * 0.4) {
      vec3 bg = scene(c + ivec2(2, 0));
      if (lum(col) > lum(bg) + 0.15) {
        float hh = hash(vec2(c) * 0.37);
        col = mix(bg, col, smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(uT * (0.7 + 0.6 * hh) + hh * 30.0)));
      }
    }
  }

  float md = length(p - MOON);
  if (sky) {
    if (md > 9.6) {
      float hl = clamp(1.0 - (md - 9.6) / (15.0 + 8.0 * uMoonFlash), 0.0, 1.0);
      col += vec3(0.35, 0.5, 0.95) * steps(hl * hl * uMoon, 4.0, c) * 0.2 * (1.0 - 0.75 * uMoonDim);
      // painted stars twinkle
      if (md > 13.0) {
        float L = lum(col);
        float nb = 0.25 * (lum(scene(c + ivec2(1, 0))) + lum(scene(c - ivec2(1, 0))) + lum(scene(c + ivec2(0, 1))) + lum(scene(c - ivec2(0, 1))));
        if (L > nb + 0.12) {
          float hh = hash(vec2(c));
          float tw = 0.5 + 0.5 * sin(uT * (1.5 + 3.0 * hh) + hh * 40.0);
          col = mix(scene(c + ivec2(1, 0)), col, 0.3 + 0.95 * tw);
        }
      }
    } else {
      col *= (1.0 - 0.35 * uMoonDim) * (1.0 + 0.28 * uMoonFlash);
    }
  }
  col *= 1.0 - 0.05 * uMoonDim;   // the whole night darkens a touch while a wisp hides the moon

  // low mist over the lake and the far shore (not over the boy)
  if (uMist > 0.0 && !sky) {
    float band = smoothstep(124.0, 136.0, p.y) * (1.0 - smoothstep(150.0, 170.0, p.y)) * (1.0 - smoothstep(240.0, 272.0, p.x));
    if (band > 0.0) {
      float n = noise(vec2(p.x * 0.045 - uT * 0.05, p.y * 0.18 + uT * 0.01)) * 0.65 + noise(vec2(p.x * 0.11 + uT * 0.09, p.y * 0.4)) * 0.35;
      float a = clamp((n - 0.38) * 2.0, 0.0, 1.0) * band * uMist;
      col = mix(col, vec3(0.34, 0.42, 0.6), steps(a, 4.0, c) * 0.18);
    }
  }
  col *= 1.0 - 0.14 * uRain;

  // 5. effect layers
  vec4 fx = texelFetch(uFx, c, 0);
  col = mix(col, fx.rgb, fx.a);
  col += texelFetch(uGlow, c, 0).rgb;
  outColor = vec4(col, 1.0);
}`;

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function makeTex(unit, src) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return t;
}

function glInit() {
  gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power" });
  if (!gl) throw new Error("WebGL2 is not available");
  prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  for (const n of ["uScene", "uMask", "uFx", "uGlow", "uOff", "uRows", "uT", "uFire", "uFlame", "uTent", "uMoon", "uMoonFlash", "uMoonDim", "uMist", "uRain", "uWind"]) U[n] = gl.getUniformLocation(prog, n);
  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  TEX.scene = makeTex(0, sceneImg);
  TEX.mask = makeTex(1, maskImg);
  TEX.fx = makeTex(2, null);
  TEX.glow = makeTex(3, null);
  gl.uniform1i(U.uScene, 0); gl.uniform1i(U.uMask, 1); gl.uniform1i(U.uFx, 2); gl.uniform1i(U.uGlow, 3);
}

function resize() {
  const iw = innerWidth, ih = innerHeight, s = Math.max(iw / W, ih / H);
  view.s = s;
  view.cols = Math.min(W, Math.ceil(iw / s - 1e-6));
  view.rows = Math.min(H, Math.ceil(ih / s - 1e-6));
  view.ox = Math.round(FOCUS[0] * (W - view.cols));
  view.oy = Math.round(FOCUS[1] * (H - view.rows));
  canvas.width = view.cols;
  canvas.height = view.rows;
  const cw = view.cols * s, ch = view.rows * s;
  canvas.style.width = cw + "px";
  canvas.style.height = ch + "px";
  canvas.style.left = (iw - cw) / 2 + "px";
  canvas.style.top = (ih - ch) / 2 + "px";
}

function render() {
  if (!gl || lost) return;
  drawAll();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, TEX.fx);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, FX);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, TEX.glow);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, GLOW);
  gl.viewport(0, 0, view.cols, view.rows);
  gl.uniform2i(U.uOff, view.ox, view.oy);
  gl.uniform1i(U.uRows, view.rows);
  gl.uniform1f(U.uT, time);
  gl.uniform1f(U.uFire, fire.light);
  gl.uniform1f(U.uFlame, fire.flame);
  gl.uniform1f(U.uTent, tent.light);
  gl.uniform1f(U.uMoon, 0.8 + 0.2 * Math.sin(time * 0.6) + moon.flash * 1.3);
  gl.uniform1f(U.uMoonFlash, moon.flash);
  gl.uniform1f(U.uMoonDim, moon.dim);
  gl.uniform1f(U.uMist, S.mist ? 1 : 0);
  gl.uniform1f(U.uRain, rainAmt);
  gl.uniform1f(U.uWind, wind);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
