/*
 * events.js — wind and gusts, rare idle events, timed callbacks, and what a click does.
 *
 * A click is routed by WHERE it lands in the painting:
 *   the float or the boy   a fish bites: the float is pulled under, sometimes a fish leaps
 *   the campfire           sparks burst up, the flame flares and lights up the whole bank
 *   the moon               the moon flares and glints sparkle around it
 *   the tent               its glow pulses
 *   the lake               ripples and a splash; sometimes a fish jumps nearby
 *   open sky               a shooting star starts where you clicked
 *   the maple              a shower of leaves
 *   anywhere else          fireflies scatter and new ones rise from the spot
 *
 * Defines: wind, gust, pointer, after(t, fn), eventsStep(dt), interact(x, y), clickAt(nx, ny), toArt(px, py)
 * Uses:    every effect module; view (gl.js) for screen -> art mapping
 */
"use strict";

let wind = 0, gust = 0, gustLeft = 0, gustDir = 1, gustWait = 0;
const pointer = { on: false, x: 0, y: 0 };
const pending = [];
const timers = { meteor: 0, fish: 0, bats: 0, owl: 0 };

function after(t, fn) { pending.push({ t, fn }); }

function eventsInit() {
  gustWait = rand(8, 20);
  timers.meteor = rand(5, 16);
  timers.fish = rand(12, 30);
  timers.bats = rand(30, 70);
  timers.owl = rand(18, 45);
  bob.next = rand(15, 35);
}

function eventsStep(dt) {
  // wind: a slow breeze plus the occasional gust that shakes more leaves loose
  if (gustLeft > 0) gustLeft -= dt;
  else if ((gustWait -= dt) <= 0) { gustLeft = rand(2.5, 5); gustWait = rand(14, 32); gustDir = chance(0.75) ? 1 : -1; }
  gust = lerp(gust, gustLeft > 0 ? 1 : 0, Math.min(1, dt * 0.9));
  wind = 0.18 + 0.14 * Math.sin(time * 0.06) + gust * 0.85 * gustDir;

  for (let i = pending.length - 1; i >= 0; i--) {
    if ((pending[i].t -= dt) <= 0) { const fn = pending[i].fn; pending.splice(i, 1); fn(); }
  }

  if (!S.events) return;
  if ((timers.meteor -= dt) <= 0) { meteorSomewhere(); timers.meteor = rand(18, 55); }
  if ((timers.fish -= dt) <= 0) { fishJumpSomewhere(); timers.fish = rand(20, 55); }
  if ((timers.bats -= dt) <= 0) { batFlight(); timers.bats = rand(60, 140); }
  if ((timers.owl -= dt) <= 0) { owlStart(); timers.owl = rand(40, 95); }
}

function interact(x, y) {
  const cx = Math.round(x), cy = Math.round(y), B = POS.bobber;
  if (Math.hypot(x - B.cx, (y - B.line) * 1.6) < 9 || inBox(POS.boy, x, y)) return bobBite();
  if (inBox(POS.fireBox, x, y)) return fireFlare();
  if (Math.hypot(x - POS.moon.x, y - POS.moon.y) < 13) return moonFlare();
  if (inBox(POS.tent, x, y)) return tentPulse();
  if (isWater(cx, cy)) return waterTouch(x, y);
  if (isSky(cx, cy)) return meteor(x, y);
  if ((y < 78 && x > 185) || (x > 368 && y < 178)) return leafShower(x, y);
  return fireflyBurst(x, y);
}

// page px -> art cells
function toArt(px, py) {
  const r = canvas.getBoundingClientRect();
  return [view.ox + (px - r.left) / r.width * view.cols, view.oy + (py - r.top) / r.height * view.rows];
}

// nx, ny: 0..1 of the screen (the app's desktop clicks) or of the page
function clickAt(nx, ny) {
  if (!S.clicks || !SCENE_PX) return;
  const [x, y] = toArt(nx * innerWidth, ny * innerHeight);
  interact(x, y);
}
