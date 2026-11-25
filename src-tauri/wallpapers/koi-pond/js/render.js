/*
 * render.js — draws one frame (call after step()).
 *
 * Passes, in order:
 *   1. surface slopes + caustics       -> T.causF (T.caus, T.surf)
 *   2. shadows on the pond floor       -> T.shadowF  (koi, pads, lotus; MAX blending)
 *   3. koi layer, deepest first        -> T.fishF    (motes, koi, bubbles; premultiplied alpha)
 *   4. composite to the screen         (FS_COMP)
 *   5. floating things on top          lotus reflections, specks, pads, food, petals, lotus shadows + flowers
 *
 * Defines: FOODB (food vertex data), fishUniforms(p, f), render()
 * Uses:    gl, P, B, T, W, H, sizes (gl.js), fish, order, pads, lotus, petals, specks, motes, food, bubbles, S
 */
"use strict";

const FOODB = new Float32Array(FOOD_MAX * 8);   // per pellet: x, y, size, fade | seed, soak, 0, 0

function fishUniforms(p, f) {
  F1(p, "uL", f.Ls); F1(p, "uSeed", f.seed); F1(p, "uVar", f.v);
  F1(p, "uDepth", clamp(f.z / ZMAX, 0, 1)); F1(p, "uZ", f.z);
  F1(p, "uPhase", f.phase); F1(p, "uAmp", f.amp); F1(p, "uFinL", f.finL); F1(p, "uFinR", f.finR);
  F1(p, "uPel", f.pel); F1(p, "uSpread", .9 + .12 * Math.cos(f.phase * 2)); F1(p, "uFlut", f.flut);
  F2(p, "uFishC", f.cx, f.cy);
}

function render() {
  // koi geometry for this frame
  for (let i = 0; i < fish.length; i++) buildFish(fish[i], i * NS * 12);
  gl.bindBuffer(gl.ARRAY_BUFFER, B.fish);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, fishData, 0, fish.length * NS * 12);

  // 1. surface slopes + caustics
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.causF);
  gl.viewport(0, 0, cW, cH);
  let p = P.caus;
  use(p, cW, cH);
  tex(p, "uSim", 0, T["sim" + simI]);
  tex(p, "uBed", 1, T.bedA);
  F2(p, "uSimTex", 1 / simW, 1 / simH);
  F1(p, "uRip", .06);
  F1(p, "uCK", 1.0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // 2. shadows on the pond floor
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.shadowF);
  gl.viewport(0, 0, sW, sH);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
  p = P.fish; use(p, sW, sH);
  tex(p, "uBed", 0, T.bedA); tex(p, "uCaus", 1, T.caus); tex(p, "uSurf", 2, T.surf);
  I1(p, "uMode", 1);
  gl.bindVertexArray(B.fishVAO);
  for (let i = 0; i < fish.length; i++) { fishUniforms(p, fish[i]); gl.drawArrays(gl.TRIANGLE_STRIP, i * NS * 2, NS * 2); }
  p = P.pad; use(p, sW, sH);
  tex(p, "uSurf", 0, T.surf); tex(p, "uBed", 1, T.bedA); I1(p, "uMode", 1);
  gl.bindVertexArray(B.padVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pads.length);
  if (S.lotus && lotus.length) {
    p = P.lotus; use(p, sW, sH);
    tex(p, "uSurf", 0, T.surf); tex(p, "uBed", 1, T.bedA); I1(p, "uMode", 4);
    gl.bindVertexArray(B.lotusVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lotus.length);
  }
  gl.blendEquation(gl.FUNC_ADD);

  // 3. koi layer (premultiplied), deepest first
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.fishF);
  gl.viewport(0, 0, W, H);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const px = H / 1080;
  p = P.pts; use(p, W, H);
  tex(p, "uSurf", 0, T.surf); I1(p, "uMode", 1); F1(p, "uPx", px);
  gl.bindVertexArray(B.motesVAO); gl.drawArrays(gl.POINTS, 0, motes.length);
  p = P.fish; use(p, W, H);
  tex(p, "uBed", 0, T.bedA); tex(p, "uCaus", 1, T.caus); tex(p, "uSurf", 2, T.surf);
  I1(p, "uMode", 0);
  gl.bindVertexArray(B.fishVAO);
  order.sort((a, b) => b.z - a.z);
  for (const f of order) { fishUniforms(p, f); gl.drawArrays(gl.TRIANGLE_STRIP, fish.indexOf(f) * NS * 2, NS * 2); }
  if (bubbles.length) {
    const cx = A * .5;
    bubbles.forEach((b, i) => {
      const z = clamp(b.z, 0, 1), sd = PERSP / (PERSP + z * ZMAX);
      BUB.set([cx + (b.x - cx) * sd, .5 + (b.y - .5) * sd, (1.6 + 3.6 * (1 - z)) * b.s * px, z], i * 4);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, B.bubbles); gl.bufferSubData(gl.ARRAY_BUFFER, 0, BUB, 0, bubbles.length * 4);
    p = P.pts; use(p, W, H);
    tex(p, "uSurf", 0, T.surf); I1(p, "uMode", 2); F1(p, "uPx", 1);
    gl.bindVertexArray(B.bubblesVAO); gl.drawArrays(gl.POINTS, 0, bubbles.length);
  }
  gl.disable(gl.BLEND);

  // 4. composite to the screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  p = P.comp; use(p, W, H);
  tex(p, "uBedA", 0, T.bedA); tex(p, "uVeg", 1, T.veg); tex(p, "uInfo", 2, T.info);
  tex(p, "uCaus", 3, T.caus); tex(p, "uSurf", 4, T.surf); tex(p, "uShadow", 5, T.shadow); tex(p, "uFish", 6, T.fish);
  gl.bindVertexArray(null);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // 5. things floating on the surface
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  if (S.lotus && lotus.length) {
    p = P.lotus; use(p, W, H);
    tex(p, "uSurf", 0, T.surf); tex(p, "uBed", 1, T.bedA); I1(p, "uMode", 2);
    gl.bindVertexArray(B.lotusVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lotus.length);
  }
  p = P.pts; use(p, W, H);
  tex(p, "uSurf", 0, T.surf); I1(p, "uMode", 0); F1(p, "uPx", px);
  gl.bindVertexArray(B.specksVAO); gl.drawArrays(gl.POINTS, 0, specks.length);
  p = P.pad; use(p, W, H);
  tex(p, "uSurf", 0, T.surf); tex(p, "uBed", 1, T.bedA); I1(p, "uMode", 0);
  gl.bindVertexArray(B.padVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pads.length);
  // fish food (always on top of the pads: it is what the koi are swimming to)
  let nf = 0;
  for (const q of food) {
    if (q.t < 0) continue;
    const a = clamp((q.life - q.age) / 4, 0, 1) * clamp(q.t / .12, 0, 1);
    const pop = q.t < .3 ? 1 + .45 * Math.pow(1 - q.t / .3, 2) : 1;
    const o = nf * 8;
    FOODB[o] = q.x; FOODB[o + 1] = q.y; FOODB[o + 2] = 15 * q.s * pop * px; FOODB[o + 3] = a;
    FOODB[o + 4] = q.ph / 6; FOODB[o + 5] = clamp(q.t / 5, 0, 1);       // seed (look of this pellet), how soaked it is
    nf++;
  }
  if (nf) {
    p = P.pts; use(p, W, H);
    tex(p, "uSurf", 0, T.surf); I1(p, "uMode", 3); F1(p, "uPx", 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.food); gl.bufferSubData(gl.ARRAY_BUFFER, 0, FOODB, 0, nf * 8);
    gl.bindVertexArray(B.foodVAO); gl.drawArrays(gl.POINTS, 0, nf);
  }
  p = P.lotus; use(p, W, H);
  tex(p, "uSurf", 0, T.surf); tex(p, "uBed", 1, T.bedA);
  I1(p, "uMode", 3);
  gl.bindVertexArray(B.petalVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, petals.length);
  if (S.lotus && lotus.length) {
    gl.bindVertexArray(B.lotusVAO);
    I1(p, "uMode", 1); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lotus.length);
    I1(p, "uMode", 0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lotus.length);
  }
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}
