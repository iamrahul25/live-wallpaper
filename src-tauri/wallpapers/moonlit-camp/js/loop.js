/*
 * loop.js — simulation clock, the frame loop with its FPS cap, pausing.
 *
 * frame() skips rAF callbacks that come sooner than the cap allows, so a 144 Hz monitor with a 30 FPS
 * cap really draws at 30. On battery the cap is at most 30 FPS. A hidden page draws nothing.
 *
 * Defines: time, running, raf, last, onBattery, step(dt), drawAll(), frame(ts), setPaused(p), window.__lwStats()
 * Uses:    every module's step/draw, render (gl.js), S, STILL
 */
"use strict";

let time = +params.get("t") || 0, running = true, raf = 0, last = 0, onBattery = false;
const stats = { n: 0, t0: 0, fps: 0 };
window.__lwStats = () => ({ fps: Math.round(stats.fps), cells: [view.cols, view.rows], leaves: leaves.length, flies: flies.length, ripples: ripples.length });

function step(dt) {
  time += dt;
  eventsStep(dt);
  fireStep(dt);
  skyStep(dt);
  waterStep(dt);
  natureStep(dt);
}

// back to front inside the FX layer: sky, smoke, lake, leaves; the GLOW layer is added on top of all
function drawAll() {
  fxClear();
  skyDraw();
  fireDraw();
  waterDraw();
  natureDraw();
}

function targetFps() { return onBattery ? Math.min(S.fps, 30) : S.fps; }

function frame(ts) {
  raf = 0;
  if (!running || lost) return;
  raf = requestAnimationFrame(frame);
  if (document.hidden) { last = 0; return; }
  const target = 1000 / targetFps();
  const gap = last ? ts - last : target;
  if (last && gap < target - 1.5) return;
  last = ts;
  step(Math.min(0.1, gap / 1000));
  render();
  stats.n++;
  if (ts - stats.t0 >= 1000) { stats.fps = stats.n * 1000 / (ts - stats.t0); stats.n = 0; stats.t0 = ts; }
}

function setPaused(p) {
  running = !p;
  last = 0;
  if (running && !raf && !STILL) raf = requestAnimationFrame(frame);
}
