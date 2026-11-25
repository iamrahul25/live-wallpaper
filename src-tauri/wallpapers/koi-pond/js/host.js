/*
 * host.js — everything the outside world can call: the Live Wallpaper app, Lively, a browser.
 *
 *   window.__lwSettings({ quality, fps, fish, lotus, calm, paused })   direct settings (any subset)
 *   window.livelyPropertyListener(name, value)  one Customize-panel / Lively property; names and values
 *                                               follow LivelyProperties.json (quality is an index 0..3)
 *   window.livelyWallpaperPlaybackChanged(json) Lively pause/resume
 *   window.__lwIcons(snapshot)                  desktop icon rectangles (the koi swim deeper behind them)
 *   window.__lwClick(x, y)                      a desktop click, 0..1 of the screen: sprinkles food
 *   window.__lwFeedStats()                      feeding debug info (also used by site/index.html)
 *   window.__lwStep(n, dt)                      manual stepping, only with ?debug
 *
 * Defines: setIcons(), fail(), the window hooks above, resize/visibility/context-loss/battery listeners
 * Uses:    setQuality, setPaused (loop.js), setFishCount (koi.js), feedAt (food.js), S, ...
 */
"use strict";

function setIcons(d) {
  if (!d || d.demo || !Array.isArray(d.r)) { iconRects = null; return; }
  if (d.vis === false) { iconRects = []; return; }
  const k = (innerWidth / (d.sw > 0 ? d.sw : innerWidth)) / innerHeight;   // physical px -> world units
  const m = .03;
  iconRects = d.r.map(([x, y, w, h]) => [x * k - m, y * k - m, (x + w) * k + m, (y + h) * k + m]);
}

function fail(e) {
  console.error("Koi Pond:", e);
  document.body.style.background = "radial-gradient(ellipse at 70% 40%, #1d7a72, #0a3d3c 55%, #04201f)";
  canvas.style.display = "none";
}
canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });
canvas.addEventListener("webglcontextrestored", () => { lost = false; try { init(); setPaused(!running); } catch (e) { fail(e); } });
document.addEventListener("visibilitychange", () => { last = 0; });
let resizeQueued = false;
addEventListener("resize", () => { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; resize(); if (STILL) render(); }); });
if (navigator.getBattery) navigator.getBattery().then((b) => { const u = () => { onBattery = !b.charging; }; b.addEventListener("chargingchange", u); u(); }).catch(() => {});

window.__lwIcons = setIcons;
window.__lwClick = feedAt;   // the host forwards clicks on the bare desktop (x, y: 0..1 of the screen)
// clicks that reach the page directly (library preview, a plain browser)
canvas.addEventListener("pointerdown", (e) => { if (e.button === 0) feedAt(e.clientX / innerWidth, e.clientY / innerHeight); });
if (params.has("debug")) window.__lwStep = (n, dt) => { for (let i = 0; i < n; i++) step(dt || 1 / 30); render(); };   // manual stepping for tests
window.__lwFeedStats = () => ({ food: food.length, landed: food.filter((p) => p.t >= 0).length, feedT: +feedT.toFixed(1),
  hungry: fish.filter((f) => f.hungry).length, chasing: fish.filter((f) => f.tgt).length, fed: fish.map((f) => f.fed) });
window.__lwSettings = (o) => {
  if (!o) return;
  if (o.fps) S.fps = clamp(+o.fps, 10, 240);
  if (o.quality) setQuality(o.quality);
  if (o.fish) setFishCount(+o.fish);
  if ("lotus" in o) S.lotus = !!o.lotus;
  if ("calm" in o) S.calm = !!o.calm;
  if (o.paused != null) setPaused(!!o.paused);
};
// One Customize-panel property. The app calls this live when the user changes a control, and once per
// saved value after the page loads; Lively calls it the same way. Names: LivelyProperties.json.
window.livelyPropertyListener = (name, val) => {
  if (name === "quality") setQuality(QUALITY_NAMES[val] || "high");
  else if (name === "fps") S.fps = clamp(+val, 10, 240);
  else if (name === "koi") setFishCount(+val);
  else if (name === "lotus") S.lotus = !!val;
  else if (name === "calmLeft") S.calm = !!val;
};
window.livelyWallpaperPlaybackChanged = (data) => {
  try { const o = typeof data === "string" ? JSON.parse(data) : data; setPaused(!!o.IsPaused); } catch (e) { /* ignore */ }
};
