/*
 * main.js — boot. Loaded last, once every other file has defined its part.
 *
 * Decodes the art (data URIs, so it also works from file://), builds the GL scene and the starting
 * population, then either renders one settled still frame (?still&t=seconds) or pre-runs two seconds
 * so smoke, embers and leaves are already in the air, and starts the frame loop.
 */
"use strict";

loadArt().then(() => {
  glInit();
  resize();
  eventsInit();
  skyInit();
  setFlyCount(S.fireflies);
  if (STILL) {
    const t0 = time || 20;
    time = 0;
    for (let i = 0, n = Math.round(t0 * 30); i < n; i++) step(1 / 30);
    render();
  } else {
    for (let i = 0; i < 60; i++) step(1 / 30);
    raf = requestAnimationFrame(frame);
  }
}).catch(fail);
