/*
 * config.js — URL options, saved Customize values and the live settings object `S`.
 *
 * Defines: canvas, params, clamp, SAVED, S, STILL
 * Uses:    the <canvas id="c"> in index.html, and window.__lwProps when the app injected it
 *
 * S (live settings; Customize names in brackets, see LivelyProperties.json):
 *   fps        frame-rate cap                                   [fps 15..60]
 *   leaves     how many maple leaves fall, 0..100               [leaves]
 *   fireflies  number of fireflies, 0..80                       [fireflies]
 *   weather    0 clear, 1 drizzle, 2 rain                       [weather]
 *   mist       low mist drifting over the lake                  [mist]
 *   events     shooting stars, jumping fish, bats, owl          [events]
 *   clicks     react to clicks on the desktop                   [clicks]
 *
 * URL options win over saved values (handy for testing):
 *   ?fps=30 ?leaves=50 ?fireflies=30 ?rain=0|1|2 ?mist=0 ?events=0 ?clicks=0 ?seed=n ?t=seconds ?still
 */
"use strict";

const canvas = document.getElementById("c");
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SAVED = (typeof window.__lwProps === "object" && window.__lwProps) || {};

function opt(url, saved, def) {
  if (params.has(url)) return params.get(url);
  if (saved in SAVED) return SAVED[saved];
  return def;
}
const truthy = (v) => v === true || v === 1 || v === "1" || v === "true";

const S = {
  fps: clamp(+opt("fps", "fps", 30) || 30, 10, 144),
  leaves: clamp(+opt("leaves", "leaves", 50), 0, 100),
  fireflies: clamp(Math.round(+opt("fireflies", "fireflies", 30)), 0, 80),
  weather: clamp(Math.round(+opt("rain", "weather", 0)) || 0, 0, 2),
  mist: truthy(opt("mist", "mist", true)),
  events: truthy(opt("events", "events", true)),
  clicks: truthy(opt("clicks", "clicks", true)),
};
const STILL = params.has("still");
