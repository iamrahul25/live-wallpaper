/*
 * loop.js — the frame loop: FPS cap, pausing, adaptive resolution.
 *
 * frame() skips rAF callbacks that come sooner than the FPS cap allows, so a 144 Hz monitor with a
 * 60 FPS cap really draws at 60. Every 90 frames it compares the average frame gap with the target and
 * lowers (or slowly restores) resScale. On battery the cap is at most 30 FPS.
 *
 * Defines: running, raf, last, onBattery, stats, window.__lwStats(), targetFps(), frame(ts),
 *          setPaused(p), setQuality(name)
 * Uses:    S, PRESETS, STILL (config.js), step (simulation.js), render (render.js), resize (setup.js)
 */
"use strict";

let running = true, raf = 0, last = 0, onBattery = false, gapSum = 0, frames = 0, calmFrames = 0;
const stats = { n: 0, t0: 0, fps: 0 };
window.__lwStats = () => ({ fps: Math.round(stats.fps), size: [W, H], resScale: +resScale.toFixed(2), quality: S.quality, hdr: HDR });
function targetFps() { const f = S.fps || PRESETS[S.quality].fps; return onBattery ? Math.min(f, 30) : f; }
function frame(ts) {
  raf = 0;
  if (!running || lost) return;
  raf = requestAnimationFrame(frame);
  if (document.hidden) { last = 0; return; }
  const target = 1000 / targetFps();
  const gap = last ? ts - last : target;
  if (last && gap < target - 1.5) return;
  last = ts;
  const dt = Math.min(.1, gap / 1000);
  step(dt);
  render();
  stats.n++;
  if (ts - stats.t0 >= 1000) { stats.fps = stats.n * 1000 / (ts - stats.t0); stats.n = 0; stats.t0 = ts; }
  // the GPU can't keep up when frames keep arriving late: drop internal resolution a step
  gapSum += gap;
  if (++frames >= 90) {
    const avg = gapSum / frames;
    if (avg > target * 1.35 && resScale > .45) { resScale *= .85; resize(); calmFrames = 0; }
    else if (avg < target * 1.08 && resScale < 1 && ++calmFrames > 8) { resScale = Math.min(1, resScale * 1.1); resize(); calmFrames = 0; }
    frames = 0; gapSum = 0;
  }
}
function setPaused(p) {
  running = !p;
  last = 0;
  if (running && !raf && !STILL) raf = requestAnimationFrame(frame);
}
function setQuality(q) { if (!PRESETS[q] || q === S.quality) return; S.quality = q; resScale = 1; resize(true); }
