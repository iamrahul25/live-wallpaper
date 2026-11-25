/*
 * host.js — everything the outside world can call: the Live Wallpaper app, Lively, a browser.
 *
 *   window.__lwSettings({ fps, leaves, fireflies, weather, mist, events, clicks, paused })   any subset
 *   window.livelyPropertyListener(name, value)   one Customize-panel / Lively property (LivelyProperties.json)
 *   window.livelyWallpaperPlaybackChanged(json)  Lively pause/resume
 *   window.__lwClick(x, y)                       a desktop click, 0..1 of the screen
 *   window.__lwInteract(x, y)                    a click in art cells (tests)
 *   window.__lwStep(n, dt)                       manual stepping, only with ?debug
 *
 * Defines: fail(), applySetting(), the window hooks above, resize/visibility/context-loss/battery listeners
 * Uses:    S, setPaused, setFlyCount, clickAt, interact, resize, render, glInit
 */
"use strict";

function fail(e) {
  console.error("Moonlit Camp:", e);
  document.body.style.background = "radial-gradient(ellipse at 60% 70%, #3a2414, #0b1430 45%, #050914)";
  canvas.style.display = "none";
}

function applySetting(name, v) {
  if (name === "fps") S.fps = clamp(+v || 30, 10, 144);
  else if (name === "leaves") S.leaves = clamp(+v, 0, 100);
  else if (name === "fireflies") { S.fireflies = clamp(Math.round(+v), 0, 80); setFlyCount(S.fireflies); }
  else if (name === "weather") S.weather = clamp(Math.round(+v) || 0, 0, 2);
  else if (name === "mist") S.mist = !!v;
  else if (name === "events") S.events = !!v;
  else if (name === "clicks") S.clicks = !!v;
  if (STILL) render();
}

canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });
canvas.addEventListener("webglcontextrestored", () => { lost = false; try { glInit(); setPaused(!running); } catch (e) { fail(e); } });
document.addEventListener("visibilitychange", () => { last = 0; });
let resizeQueued = false;
addEventListener("resize", () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => { resizeQueued = false; resize(); if (STILL) render(); });
});
if (navigator.getBattery) navigator.getBattery().then((b) => { const u = () => { onBattery = !b.charging; }; b.addEventListener("chargingchange", u); u(); }).catch(() => {});

// clicks forwarded by the app from the bare desktop (x, y: 0..1 of the screen)
window.__lwClick = clickAt;
window.__lwInteract = (x, y) => interact(x, y);
// clicks and hover that reach the page directly (library preview, a plain browser)
addEventListener("pointerdown", (e) => { if (e.button === 0) clickAt(e.clientX / innerWidth, e.clientY / innerHeight); });
addEventListener("pointermove", (e) => {
  if (!SCENE_PX) return;
  [pointer.x, pointer.y] = toArt(e.clientX, e.clientY);
  pointer.on = true;
});
document.addEventListener("pointerleave", () => { pointer.on = false; });
if (params.has("debug")) window.__lwStep = (n, dt) => { for (let i = 0; i < n; i++) step(dt || 1 / 30); render(); };

window.__lwSettings = (o) => {
  if (!o) return;
  for (const k of ["fps", "leaves", "fireflies", "weather", "mist", "events", "clicks"]) if (k in o) applySetting(k, o[k]);
  if (o.paused != null) setPaused(!!o.paused);
};
// One Customize-panel property: called live when the user changes a control, and once per saved
// value after the page loads. Lively calls it the same way. Names: LivelyProperties.json.
window.livelyPropertyListener = (name, val) => applySetting(name, val);
window.livelyWallpaperPlaybackChanged = (data) => {
  try { const o = typeof data === "string" ? JSON.parse(data) : data; setPaused(!!o.IsPaused); } catch (e) { /* ignore */ }
};
