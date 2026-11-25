/*
 * setup.js — creates the GL context, programs, buffers and render targets.
 *
 * Defines: vao(), attr(), init() (call once, and again after a lost context),
 *          resize(force) sizes every target from the window, devicePixelRatio, the quality preset and
 *          resScale; re-bakes the floor and re-lays the scene when the aspect or preset changes,
 *          bakeBed() renders FS_BED in strips (so no single draw trips the GPU watchdog)
 * Uses:    all shader sources, program/makeTex/makeFBO/drop (gl.js), PRESETS, S, STILL (config.js),
 *          layout/uploadScene (scene.js), fish, danger (koi.js)
 */
"use strict";

function vao(setup) { const v = gl.createVertexArray(); gl.bindVertexArray(v); setup(); gl.bindVertexArray(null); return v; }
function attr(buf, loc, size, stride, offset, divisor = 0) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  gl.vertexAttribDivisor(loc, divisor);
}

function init() {
  gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: STILL });
  if (!gl) throw new Error("WebGL2 unavailable");
  HDR = !!gl.getExtension("EXT_color_buffer_float");
  T = {}; bedKey = "";
  P.bed = program(VS_FULL, FS_BED);
  P.sim = program(VS_FULL, FS_SIM);
  P.caus = program(VS_FULL, FS_CAUS);
  P.comp = program(VS_FULL, FS_COMP);
  P.fish = program(VS_FISH, FS_FISH, ["aPos", "aUV", "aLat"]);
  P.pad = program(VS_PAD, FS_PAD, ["aCorner", "aP", "aQ"]);
  P.lotus = program(VS_LOTUS, FS_LOTUS, ["aCorner", "aP", "aQ"]);
  P.pts = program(VS_PTS, FS_PTS, ["aP", "aQ"]);
  const mk = () => gl.createBuffer();
  B = { quad: mk(), fish: mk(), padInst: mk(), lotusInst: mk(), petalInst: mk(), specks: mk(), motes: mk(), bubbles: mk(), food: mk() };
  gl.bindBuffer(gl.ARRAY_BUFFER, B.quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, B.fish);
  gl.bufferData(gl.ARRAY_BUFFER, fishData.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, B.bubbles);
  gl.bufferData(gl.ARRAY_BUFFER, BUB.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, B.food);
  gl.bufferData(gl.ARRAY_BUFFER, FOODB.byteLength, gl.DYNAMIC_DRAW);
  B.foodVAO = vao(() => { attr(B.food, 0, 4, 32, 0); attr(B.food, 1, 4, 32, 16); });
  B.fishVAO = vao(() => { attr(B.fish, 0, 2, 24, 0); attr(B.fish, 1, 2, 24, 8); attr(B.fish, 2, 2, 24, 16); });
  const inst = (buf) => vao(() => { attr(B.quad, 0, 2, 8, 0); attr(buf, 1, 4, 32, 0, 1); attr(buf, 2, 4, 32, 16, 1); });
  B.padVAO = inst(B.padInst); B.lotusVAO = inst(B.lotusInst); B.petalVAO = inst(B.petalInst);
  B.specksVAO = vao(() => attr(B.specks, 0, 4, 16, 0));
  B.motesVAO = vao(() => attr(B.motes, 0, 4, 16, 0));
  B.bubblesVAO = vao(() => attr(B.bubbles, 0, 4, 16, 0));
  resize(true);
}

function resize(force) {
  if (!gl || lost) return;
  const dpr = window.devicePixelRatio || 1;
  const nw = Math.max(2, Math.round(innerWidth * dpr)), nh = Math.max(2, Math.round(innerHeight * dpr));
  const pr = PRESETS[S.quality];
  const sc = Math.min(1, Math.sqrt(pr.px * resScale / (nw * nh)));
  const w = Math.max(2, Math.round(nw * sc)), h = Math.max(2, Math.round(nh * sc));
  const aspect = nw / nh;
  const bs = Math.min(1, Math.sqrt(pr.bed / (nw * nh)));
  const key = [Math.round(nw * bs), Math.round(nh * bs), pr.sim, aspect.toFixed(4)].join("x");
  if (key !== bedKey) {
    bedKey = key;
    A = aspect;
    bedW = Math.round(nw * bs); bedH = Math.round(nh * bs);
    simH = pr.sim; simW = Math.round(pr.sim * A);
    drop(["bedA", "veg", "info", "bedF", "sim0", "sim1", "simF0", "simF1"]);
    T.bedA = makeTex(bedW, bedH, false); T.veg = makeTex(bedW, bedH, false); T.info = makeTex(bedW, bedH, false);
    T.bedF = makeFBO([T.bedA, T.veg, T.info]);
    T.sim0 = makeTex(simW, simH, true); T.sim1 = makeTex(simW, simH, true);
    T.simF0 = makeFBO([T.sim0]); T.simF1 = makeFBO([T.sim1]);
    gl.clearColor(0, 0, 0, 0);
    for (const f of [T.simF0, T.simF1]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clear(gl.COLOR_BUFFER_BIT); }
    bakeBed();
    layout();
    uploadScene();
    for (const f of fish) if (danger(f.x, f.y) > .5) { f.x = A * .6; f.y = .5; }
    force = true;
  }
  if (force || w !== W || h !== H) {
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    cW = Math.max(2, Math.round(W * pr.cs)); cH = Math.max(2, Math.round(H * pr.cs));
    sW = Math.max(2, Math.round(W * pr.sh)); sH = Math.max(2, Math.round(H * pr.sh));
    drop(["caus", "surf", "causF", "shadow", "shadowF", "fish", "fishF"]);
    T.caus = makeTex(cW, cH, true); T.surf = makeTex(cW, cH, true); T.causF = makeFBO([T.caus, T.surf]);
    T.shadow = makeTex(sW, sH, false); T.shadowF = makeFBO([T.shadow]);
    T.fish = makeTex(W, H, true); T.fishF = makeFBO([T.fish]);
  }
}

// baked in horizontal strips so no single draw is long enough to trip the GPU watchdog
function bakeBed() {
  const p = P.bed;
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.bedF);
  gl.viewport(0, 0, bedW, bedH);
  use(p, bedW, bedH);
  gl.enable(gl.SCISSOR_TEST);
  const strips = Math.max(4, Math.ceil(bedW * bedH / 4e5));
  for (let i = 0; i < strips; i++) {
    const y0 = Math.floor(bedH * i / strips), y1 = Math.floor(bedH * (i + 1) / strips);
    gl.scissor(0, y0, bedW, y1 - y0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();
  }
  gl.disable(gl.SCISSOR_TEST);
}
