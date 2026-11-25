/*
 * gl.js — WebGL2 state and small wrappers.
 *
 * Defines: gl, HDR (float render targets available), P (programs), B (buffers/VAOs), T (textures/FBOs)
 *          W, H (main render size), bedW/bedH, cW/cH (caustics), sW/sH (shadows), simW/simH
 *          resScale (adaptive resolution 0.45..1, loop.js lowers it when the GPU falls behind)
 *          compile(), program(vs, fs, attribs) -> { p, u: uniform locations by name }
 *          F1/F2/I1 set a uniform if the program uses it, tex() bind a texture to a unit + sampler
 *          use(p, w, h) bind a program and set the shared uniforms from COMMON
 *          makeTex(), makeFBO(), drop() delete textures/FBOs from T by key
 * Uses:    COMMON (shaders/common.js), A (world.js), S (config.js), time (simulation.js)
 */
"use strict";

let gl, HDR = true, P = {}, B = {}, T = {};
let W = 2, H = 2, bedW = 2, bedH = 2, cW = 2, cH = 2, sW = 2, sH = 2, simW = 2, simH = 2;
let resScale = 1, simI = 0, bedKey = "", lost = false;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    console.error(log, src.split("\n").map((l, i) => i + 1 + ": " + l).join("\n"));
    throw new Error(log);
  }
  return s;
}
function program(vs, fs, attribs = []) {
  const head = "#version 300 es\n" + (HDR ? "" : "#define LDR\n") + COMMON;
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, head + vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, head + fs));
  attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}
const F1 = (p, n, a) => { const l = p.u[n]; if (l) gl.uniform1f(l, a); };
const F2 = (p, n, a, b) => { const l = p.u[n]; if (l) gl.uniform2f(l, a, b); };
const I1 = (p, n, a) => { const l = p.u[n]; if (l) gl.uniform1i(l, a); };
function tex(p, name, unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); I1(p, name, unit); }
let sunI = 1;
function use(p, w, h) {
  gl.useProgram(p.p);
  F1(p, "uA", A); F1(p, "uTime", time); F1(p, "uSunI", sunI); F1(p, "uCalm", S.calm ? 1 : 0); F2(p, "uRes", w, h);
}

function makeTex(w, h, hdr) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  if (hdr && HDR) gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
  else gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function makeFBO(texs) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error("framebuffer incomplete " + st);
  return f;
}
function drop(keys) {
  for (const k of keys) {
    const v = T[k];
    if (!v) continue;
    if (v instanceof WebGLFramebuffer) gl.deleteFramebuffer(v); else gl.deleteTexture(v);
    T[k] = null;
  }
}
