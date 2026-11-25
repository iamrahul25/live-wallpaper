/*
 * main.js — boot. Loaded last, once every other file has defined its part.
 *
 * Creates the GL scene, adds the koi, pulls the desktop icon snapshot from the app (GET /__icons),
 * then either renders one settled still frame (?still) or pre-runs 3 s and starts the frame loop.
 */
"use strict";

try {
  init();
  setFishCount(S.fish);
  if (location.protocol.startsWith("http")) {
    fetch("/__icons", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setIcons).catch(() => {});
  }
  if (STILL) {
    const t0 = time || 24;
    time = 0;
    for (let i = 0, n = Math.round(t0 * 30); i < n; i++) step(1 / 30);
    render();
  } else {
    for (let i = 0; i < 90; i++) step(1 / 30);   // settle the ripples and the swimmers before the first frame
    raf = requestAnimationFrame(frame);
  }
} catch (e) { fail(e); }
