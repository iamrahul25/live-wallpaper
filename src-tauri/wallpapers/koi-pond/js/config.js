/*
 * config.js — URL options, quality presets and the live settings object `S`.
 *
 * Loaded first. Every later file reads `S`; host.js changes it at runtime.
 *
 * Defines: canvas, params, PRESETS, clamp, QUALITY_NAMES, SAVED, S, STILL
 * Uses:    the <canvas id="c"> in index.html, and window.__lwProps when the app injected it
 *
 * S (live settings):
 *   quality  "low" | "medium" | "high" | "ultra"   (Customize: "quality", dropdown index 0..3)
 *   fps      frame-rate cap, 0 = the preset's rate (Customize: "fps", 20..144)
 *   fish     number of koi, 1..14                  (Customize: "koi")
 *   lotus    draw the lotus flowers                (Customize: "lotus")
 *   calm     keep the left side calm and the koi away from the desktop icons (Customize: "calmLeft")
 *
 * Quality presets (PRESETS[S.quality]):
 *   px   target pixel count of the main render (resolution scales down to reach it)
 *   bed  pixel count of the baked pond-floor textures
 *   cs   caustics/surface buffer scale (fraction of the main resolution)
 *   sh   shadow buffer scale
 *   sim  ripple simulation height in cells (width follows the aspect ratio)
 *   fps  default frame-rate cap when the user has not set one
 */
"use strict";

const canvas = document.getElementById("c");
const params = new URLSearchParams(location.search);
const PRESETS = {
  low:    { px: 1.0e6, bed: 1.3e6, cs: .42, sh: .40, sim: 200, fps: 30 },
  medium: { px: 2.1e6, bed: 2.1e6, cs: .50, sh: .50, sim: 280, fps: 60 },
  high:   { px: 3.7e6, bed: 3.7e6, cs: .55, sh: .50, sim: 340, fps: 60 },
  ultra:  { px: 9.0e6, bed: 6.0e6, cs: .60, sh: .50, sim: 420, fps: 60 },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// The "quality" dropdown in LivelyProperties.json sends an index into this list.
const QUALITY_NAMES = ["low", "medium", "high", "ultra"];

// Values the user saved in the app's Customize panel, keyed by the LivelyProperties.json names
// (quality, fps, koi, lotus, calmLeft). The app injects them before any wallpaper script runs, so the
// first frame already uses them. URL options win over them (handy for testing).
const SAVED = (typeof window.__lwProps === "object" && window.__lwProps) || {};

const S = {
  quality: PRESETS[params.get("q")] ? params.get("q") : QUALITY_NAMES[SAVED.quality] || "high",
  fps: +params.get("fps") || (+SAVED.fps ? clamp(+SAVED.fps, 10, 240) : 0),   // 0 = the preset's rate
  fish: clamp(Math.round(+params.get("fish") || +SAVED.koi || 8), 1, 14),
  lotus: "lotus" in SAVED ? !!SAVED.lotus : true,
  calm: "calmLeft" in SAVED ? !!SAVED.calmLeft : true,   // keep the left side calm for desktop icons
};
const STILL = params.has("still");
