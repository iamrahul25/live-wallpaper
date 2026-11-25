/*
 * food.js — feeding: click the water to sprinkle pellets, the koi swim over and eat them.
 *
 * A click (feedAt) drops a handful of pellets that fall, float, drift and soak. Every koi notices,
 * the farther away the later. feedUpdate() picks the nearest pellet for a koi each frame.
 *
 * Defines: FOOD_MAX, FEED_TIME, FOOD_REACT, food (pellets), feedT (seconds of interest left),
 *          fdx/fdy/fd (direction to the chased pellet, read by updateFish),
 *          safeSpot(), feedAt(fx, fy) (0..1 of the screen), endFeed(), stepFood(dt), feedUpdate(f, dt)
 * Uses:    danger (koi.js), fish, A, rnd, events, spawnBubbles, time
 */
"use strict";

/* ---------- feeding: click the water to sprinkle food, the koi swim over and eat it ---------- */
const FOOD_MAX = 40;        // pellets alive at once (oldest go first), so click spam stays cheap
const FEED_TIME = 18;       // seconds of interest after the latest click
const FOOD_REACT = 1.1;     // distance (world units) beyond which a koi's reaction delay stops growing
let food = [], feedT = 0;
let fdx = 0, fdy = 0, fd = 0;   // vector to the pellet a chasing koi is heading for

// pellets and the koi chasing them must stay clear of everything danger() steers away from
function safeSpot(x, y) {
  if (danger(x, y) > 0) return false;
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .6; if (danger(x + Math.cos(a) * .05, y + Math.sin(a) * .05) > 0) return false; }
  return true;
}
// x, y: click position as a fraction of the screen
function feedAt(fx, fy) {
  if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1) || !fish.length) return;
  const x = fx * A, y = fy;
  if (!safeSpot(x, y)) return;                         // stone, shore or desktop icons: not water the koi can reach
  const fresh = food.length === 0;
  const n = 6 + (rnd() * 7 | 0);
  const add = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.2832, r = .004 + .042 * Math.pow(rnd(), .8);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (!safeSpot(px, py)) continue;
    add.push({ x: px, y: py, vx: (rnd() - .5) * .006, vy: (rnd() - .5) * .006, s: .7 + .7 * rnd(),
               t: -rnd() * .5, age: 0, life: 16 + rnd() * 4, gone: false, ph: rnd() * 6 });   // t < 0: still falling
  }
  if (!add.length) return;
  while (food.length + add.length > FOOD_MAX && food.length) food.shift().gone = true;
  for (const p of add.slice(0, FOOD_MAX)) food.push(p);
  feedT = FEED_TIME;
  events.push({ x, y, r: .016, w: -.05, n: 3 });       // the splash of the whole handful
  for (const f of fish) {
    if (fresh) f.fed = 0;
    const d = Math.hypot(f.x - x, f.y - y);
    // every koi comes for food; the farther away, the later it notices (at most ~2 s)
    if (!f.hungry && f.react <= 0) f.react = .2 + Math.min(d, FOOD_REACT) * 1.1 + rnd() * .5;
  }
}
function endFeed(f) {
  f.hungry = false; f.react = 0; f.tgt = null; f.chew = 0;
  f.depthT = .2 + .25 * rnd();
  f.sipT = Math.max(f.sipT, 15 + rnd() * 25);
}
function stepFood(dt) {
  if (feedT > 0) feedT -= dt;
  if (!food.length) return;
  for (const p of food) {
    p.age += dt;
    if (p.t < 0) {
      p.t += dt;
      if (p.t >= 0) events.push({ x: p.x, y: p.y, r: .0055, w: -.03, n: 2 });   // lands: a small ripple
      continue;
    }
    p.t += dt;
    const nx = p.x + (p.vx + .003 * Math.sin(time * .7 + p.ph)) * dt, ny = p.y + (p.vy + .003 * Math.cos(time * .6 + p.ph)) * dt;
    if (danger(nx, ny) === 0) { p.x = nx; p.y = ny; } else { p.vx *= -.5; p.vy *= -.5; }
    if (p.age > p.life) p.gone = true;
  }
  food = food.filter((p) => !p.gone);
}
// true while this koi is heading for food; the direction and distance end up in fdx, fdy, fd
function feedUpdate(f, dt) {
  // no appetite limit: koi keep eating while there is food
  if (feedT <= 0 || !food.length) { if (f.hungry) endFeed(f); f.react = 0; return false; }
  if (f.chew > 0) f.chew -= dt;
  if (f.react > 0 && (f.react -= dt) <= 0) f.hungry = true;
  const L = f.L, ch = Math.cos(f.h), sh = Math.sin(f.h);
  const mx = f.x + ch * L * .04, my = f.y + sh * L * .04;     // the mouth
  if (!f.hungry) {                                             // koi swimming close to food notice it anyway
    for (const p of food) if (p.t >= 0 && Math.hypot(p.x - mx, p.y - my) < .4) { f.hungry = true; break; }
    if (!f.hungry) return false;
  }
  if (f.hungry && f.sipping) { f.sipping = false; f.sipDone = false; }
  // nearest landed pellet, sticking with the current one unless another is clearly closer
  let best = null, bd = 1e9;
  for (const p of food) {
    if (p.t < 0 || p.gone) continue;
    const d = Math.hypot(p.x - mx, p.y - my);
    if (d < bd) { bd = d; best = p; }
  }
  if (f.tgt && !f.tgt.gone && f.tgt.t >= 0 && best !== f.tgt) {
    const dt0 = Math.hypot(f.tgt.x - mx, f.tgt.y - my);
    if (dt0 < bd * 1.6) { best = f.tgt; bd = dt0; }
  }
  if (!best) return false;
  f.tgt = best;
  if (bd < L * .2 + .008 && f.z01 < .18 && f.chew <= 0) {      // reached it: eat
    best.gone = true; f.tgt = null; f.fed++; f.chew = .4;
    events.push({ x: best.x, y: best.y, r: .007 + L * .02, w: -.045, n: 3 });
    if (rnd() < .45) spawnBubbles(best.x, best.y, 1, .05);
    return false;
  }
  fdx = best.x - mx; fdy = best.y - my; fd = bd;
  return true;
}
