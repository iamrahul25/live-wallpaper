/*
 * koi.js — koi data and swimming behaviour.
 *
 * Each koi `f` is a plain object: position (x, y), heading h, speed, depth z01 (0 surface .. 1 deep),
 * swim stroke (phase, freq, amp), fins, a behaviour mode, and a trail of recent positions (trX/trY ring
 * buffer) that koi-mesh.js bends the body along.
 *
 * Modes (pickMode): cruise, slow, glide, burst, follow (another koi). Koi also rise to sip at the surface,
 * avoid the shore, each other and the desktop icons, and chase food (food.js feedUpdate).
 *
 * Defines: NS (spine samples), TR (trail length), PERSP, ZMAX (max depth), WAVEK, UA (u per spine sample),
 *          bodyWjs, HW (mesh half-widths), KOI (variety, length) table, fishData (vertex buffer data),
 *          fish (all koi), order (draw order, deepest first)
 *          iconRects, ICON_BAND, iconDanger(), danger() (0 = free water, > 0 = steer away)
 *          makeFish(i), setFishCount(n) (1..14), pickMode(f), angDiff(), updateFish(f, dt)
 * Uses:    S, clamp (config.js), A, shoreBand, floorDepth, ss, noise1, rnd (world.js), time (simulation.js),
 *          feedUpdate (food.js), events, spawnBubbles (simulation.js)
 */
"use strict";

const NS = 34, TR = 200, PERSP = 3.0, ZMAX = .17, WAVEK = 2 * Math.PI * .85;
const UA = new Float32Array(NS).map((_, k) => -.02 + 1.02 * k / (NS - 1));
const bodyWjs = (u) => { const t = clamp(u / .84, 0, 1); return Math.max(.205 * Math.pow(t, .42) * Math.pow(1 - t, .62), .021 * ss(.60, .72, u) * ss(.905, .84, u)); };
const HW = UA.map((u) => {
  let w = bodyWjs(u) + .014;
  if (u > .09 && u < .52) w = Math.max(w, .285 * Math.min(1, (u - .09) / .06, (.52 - u) / .06));
  if (u > .45 && u < .72) w = Math.max(w, .17 * Math.min(1, (u - .45) / .04, (.72 - u) / .05));
  if (u > .74) w = Math.max(w, .04 + (u - .74) * .9);
  return w;
});
// variety: 0 kohaku, 1 orange ogon, 2 sanke, 3 tancho, 4 yamabuki, 5 hariwake, 6 showa
const KOI = [[0, .255], [1, .235], [2, .215], [4, .205], [0, .19], [3, .175], [5, .165], [1, .145],
             [2, .17], [6, .20], [4, .15], [0, .14], [1, .18], [5, .2]];
const fishData = new Float32Array(14 * NS * 2 * 6);
let fish = [], order = [];

let iconRects = null;      // null: no icon data, assume the usual left-hand columns
const ICON_BAND = .22;
function iconDanger(x, y) {
  if (!S.calm) return 0;
  if (iconRects === null) return ss(ICON_BAND + .04, ICON_BAND - .04, x);
  for (const r of iconRects) if (x > r[0] && x < r[2] && y > r[1] && y < r[3]) return 1;
  return 0;
}
function danger(x, y) {
  let d = 0;
  if (x < -.05) d = (-.05 - x) * 12;
  if (y < -.05) d = Math.max(d, (-.05 - y) * 12);
  if (y > 1.05) d = Math.max(d, (y - 1.05) * 12);
  if (x > A + .03) d = Math.max(d, (x - A - .03) * 12);
  d = Math.max(d, clamp((shoreBand(x, y) + .08) / .05, 0, 2));
  return Math.max(d, .6 * iconDanger(x, y));
}

function makeFish(i) {
  const [v, L] = KOI[i % KOI.length];
  let x = A * .6, y = .5;
  for (let k = 0; k < 60; k++) {
    x = A * (.38 + .45 * rnd()); y = .15 + .7 * rnd();
    if (danger(x, y) === 0) break;
  }
  const f = {
    v, L: L * (.95 + .1 * rnd()), seed: rnd() * 100, x, y, h: rnd() * Math.PI * 2, speed: .05, tv: 0,
    z01: .2 + .4 * rnd(), vz: 0, depthT: .3, z: .05,
    phase: rnd() * 6, freq: 1, amp: .05, finL: 1, finR: 1, finPh: rnd() * 6, pel: .6, flut: 0,
    mode: "cruise", modeT: 3 + rnd() * 8, cruise: .4 + .25 * rnd(), wf: .05 + .07 * rnd(), wt: .35 + .35 * rnd(),
    sipT: 12 + rnd() * 50, sipping: false, sipDone: false, sipHold: 0, leader: null,
    hungry: false, react: 0, fed: 0, chew: 0, tgt: null,
    trX: new Float32Array(TR), trY: new Float32Array(TR), trHead: 0, trN: 0,
    sx: new Float32Array(NS), sy: new Float32Array(NS), cx: 0, cy: 0,
  };
  f.speed = f.cruise * f.L;
  // start with a straight trail behind the head
  const step = f.L * .012;
  for (let k = TR - 1; k >= 0; k--) {
    f.trHead = (f.trHead + 1) % TR;
    f.trX[f.trHead] = x - Math.cos(f.h) * step * k;
    f.trY[f.trHead] = y - Math.sin(f.h) * step * k;
  }
  f.trN = TR;
  return f;
}
function setFishCount(n) {
  n = clamp(Math.round(n), 1, 14);
  while (fish.length < n) fish.push(makeFish(fish.length));
  fish.length = n;
  order = fish.slice();
  for (const f of fish) if (f.leader && !fish.includes(f.leader)) f.leader = null;
}

function pickMode(f) {
  if (f.mode === "burst") { f.mode = "glide"; f.modeT = 1.6 + rnd() * 1.8; return; }
  const r = rnd();
  f.leader = null;
  if (r < .50) { f.mode = "cruise"; f.modeT = 6 + rnd() * 12; f.cruise = .34 + .32 * rnd(); }
  else if (r < .72) { f.mode = "slow"; f.modeT = 4 + rnd() * 7; }
  else if (r < .82) { f.mode = "glide"; f.modeT = 2 + rnd() * 2.5; }
  else if (r < .89) { f.mode = "burst"; f.modeT = .7 + rnd() * .7; }
  else {
    let best = null, bd = .7;
    for (const g of fish) { if (g === f || g.leader === f) continue; const d = Math.hypot(g.x - f.x, g.y - f.y); if (d < bd) { bd = d; best = g; } }
    if (best) { f.mode = "follow"; f.leader = best; f.modeT = 8 + rnd() * 14; } else { f.mode = "cruise"; f.modeT = 6 + rnd() * 8; }
  }
  if (rnd() < .45 && !f.sipping) f.depthT = rnd() < .2 ? .65 + .3 * rnd() : .08 + .42 * rnd();
  f.wf = .04 + .08 * rnd(); f.wt = .3 + .45 * rnd();
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function updateFish(f, dt) {
  f.modeT -= dt;
  if (f.modeT <= 0) pickMode(f);
  const L = f.L;
  const chasing = feedUpdate(f, dt);
  // rise to sip at the surface now and then
  f.sipT -= dt;
  if (f.sipT <= 0 && !f.sipping && !f.hungry && iconDanger(f.x, f.y) === 0) { f.sipping = true; f.sipDone = false; f.depthT = 0; }
  if (f.sipping) {
    if (!f.sipDone && f.z01 < .045) {
      f.sipDone = true; f.sipHold = 1.2 + rnd();
      const mx = f.sx[2], my = f.sy[2];
      events.push({ x: mx, y: my, r: .010 + f.L * .02, w: -.05, n: 5 });
      spawnBubbles(mx, my, 2 + (rnd() * 2 | 0), .05);
    }
    if (f.sipDone && (f.sipHold -= dt) <= 0) { f.sipping = false; f.depthT = .2 + .25 * rnd(); f.sipT = 30 + rnd() * 60; }
  }
  // depth: glide up and down smoothly; slip deeper when passing behind desktop icons
  let depthT = chasing ? 0 : f.depthT;
  if (iconDanger(f.x, f.y) > .3 && !f.sipping) depthT = Math.max(depthT, .8);
  const vzMax = chasing ? .35 : .12;                  // hungry koi come up fast
  f.vz += (clamp((depthT - f.z01) * .6, -vzMax, vzMax) - f.vz) * Math.min(1, dt * 1.5);
  f.z01 = clamp(f.z01 + f.vz * dt, 0, 1);
  f.z = f.z01 * Math.min(ZMAX, floorDepth(f.x, f.y) * .85);

  // ---- steering
  const ch = Math.cos(f.h), sh = Math.sin(f.h);
  const t = time;
  let turn = (noise1(f.seed * 7.1 + t * f.wf) + .35 * noise1(f.seed * 3.3 + t * f.wf * 2.7)) * f.wt;
  if (chasing) turn *= .2;                            // less dawdling when there is food
  const look = L * .9 + f.speed * 1.1;
  const dC = danger(f.x + ch * look, f.y + sh * look);
  if (dC > .001) {
    const dL = danger(f.x + Math.cos(f.h - .7) * look, f.y + Math.sin(f.h - .7) * look);
    const dR = danger(f.x + Math.cos(f.h + .7) * look, f.y + Math.sin(f.h + .7) * look);
    turn += (dL <= dR ? -1 : 1) * (.6 + 2.2 * Math.min(dC, 1.5));
  }
  const d0 = danger(f.x, f.y);
  if (d0 > .05) {
    const e = .02;
    const gx = danger(f.x + e, f.y) - danger(f.x - e, f.y), gy = danger(f.x, f.y + e) - danger(f.x, f.y - e);
    const away = (Math.abs(gx) + Math.abs(gy) > 1e-6) ? Math.atan2(-gy, -gx) : Math.atan2(.5 - f.y, A * .6 - f.x);
    turn += clamp(angDiff(away, f.h), -1.2, 1.2) * 1.4 * Math.min(d0, 1.5);
  }
  for (const g of fish) {
    if (g === f || Math.abs(g.z01 - f.z01) > .3) continue;
    const dx = g.x - f.x, dy = g.y - f.y, dist = Math.hypot(dx, dy), R = (f.L + g.L) * .45;
    if (dist < R && dist > 1e-5) turn -= Math.sign(ch * dy - sh * dx) * (1 - dist / R) * 1.6;
  }
  let target, da = 0;
  if (chasing) {
    // swing toward the pellet (the usual turn-rate limit keeps it smooth) and ease off as it gets close
    da = angDiff(Math.atan2(fdy, fdx), f.h);
    turn += clamp(da, -1.4, 1.4) * 1.8;
    target = L * clamp(fd / (1.3 * L), .16, .95) * (.35 + .65 * Math.max(0, Math.cos(da)));
    if (f.chew > 0) target = Math.min(target, .12 * L);
  } else if (f.mode === "follow" && f.leader) {
    const g = f.leader, bx = g.x - Math.cos(g.h) * g.L * 1.3, by = g.y - Math.sin(g.h) * g.L * 1.3;
    turn += clamp(angDiff(Math.atan2(by - f.y, bx - f.x), f.h), -1, 1) * .9;
    target = clamp(g.speed / L * (Math.hypot(bx - f.x, by - f.y) > L ? 1.15 : .95), .2, .9) * L;
  } else target = (f.mode === "cruise" ? f.cruise : f.mode === "slow" ? .16 : f.mode === "burst" ? 1.5 : 0) * L;
  if (f.sipping && !f.sipDone) target = Math.min(target || .2 * L, .25 * L);
  const maxTurn = .25 + 1.6 * f.speed / L;
  turn = clamp(turn, -maxTurn, maxTurn);
  f.tv += (turn - f.tv) * Math.min(1, dt * 1.8);
  f.h += f.tv * dt;

  // ---- speed and stroke
  const gliding = !chasing && f.mode === "glide";
  target *= 1 - .25 * Math.min(1, Math.abs(f.tv) / maxTurn);
  if (gliding) f.speed += (.07 * L - f.speed) * .35 * dt;
  else { const err = target - f.speed; f.speed += err * (err > 0 ? 1.1 : .45) * dt; }
  f.speed = Math.max(f.speed, .06 * L);
  const err = target - f.speed;
  const effort = gliding ? 0 : clamp(.3 + Math.max(0, err) / (.4 * L) + Math.abs(f.tv) * .35, 0, 1.3);
  f.amp += ((gliding ? .012 : .03 + .075 * effort) - f.amp) * Math.min(1, dt * 2.5);
  f.freq += (.55 + 1.5 * f.speed / L + effort * .4 - f.freq) * Math.min(1, dt * 2);
  f.phase += 2 * Math.PI * f.freq * dt;
  // pectoral fins: spread when slow or braking, tucked when fast, scull while hovering
  const sp = clamp(f.speed / (.9 * L), 0, 1);
  let base = 1.25 - .85 * sp;
  if (gliding) base = Math.max(base, .95);
  const tk = clamp(f.tv / 1.5, -1, 1), scull = (1 - sp) * .16;
  f.finPh += dt * (2.2 + 2 * (1 - sp));
  const k = Math.min(1, dt * 4);
  f.finR += (clamp(base + tk * .35 + scull * Math.sin(f.finPh), .3, 1.7) - f.finR) * k;
  f.finL += (clamp(base - tk * .35 + scull * Math.sin(f.finPh + Math.PI), .3, 1.7) - f.finL) * k;
  f.pel += (.55 + .35 * (1 - sp) - f.pel) * k;
  f.flut += dt * (4 + 3 * sp);

  f.x += Math.cos(f.h) * f.speed * dt;
  f.y += Math.sin(f.h) * f.speed * dt;
  const lx = f.trX[f.trHead], ly = f.trY[f.trHead];
  if (Math.hypot(f.x - lx, f.y - ly) > L * .012) {
    f.trHead = (f.trHead + 1) % TR;
    f.trX[f.trHead] = f.x; f.trY[f.trHead] = f.y;
    f.trN = Math.min(TR, f.trN + 1);
  }
}
