/*
 * nature.js — fireflies, falling maple leaves and the owl in the pines.
 *
 * Fireflies wander inside a few zones (the left bushes, the far treeline, around the tent) and blink
 * slowly. They drift toward the mouse when it is near (in a browser; the desktop only sends clicks)
 * and scatter, glowing, when you click near them.
 *
 * Leaves leave the maple from real red cells of the painted canopy, tumble (their sprite narrows to
 * an edge and widens again), sway in the wind and settle on the grass or float on the lake.
 *
 * Defines: flies, setFlyCount(n), fireflyBurst(x, y), leaves, leafShower(x, y), owlStart(),
 *          natureStep(dt), natureDraw()
 * Uses:    world.js helpers, fx.js drawing, time, wind, gust, pointer, rainAmt, ripple (water.js)
 */
"use strict";

/* ---- fireflies ---------------------------------------------------------------------------------- */

const FLY_ZONES = [[2, 96, 98, 140], [100, 121, 270, 137], [298, 90, 412, 152], [2, 150, 58, 186]];
const FLY_WEIGHT = [4, 3, 3, 1];
const FLY_CORE = [236, 255, 150], FLY_HALO = [150, 214, 64];
const flies = [];

function pickZone() {
  let r = rnd() * 11;
  for (let i = 0; i < FLY_WEIGHT.length; i++) { if ((r -= FLY_WEIGHT[i]) < 0) return i; }
  return 0;
}
function makeFly(z, x, y, life) {
  const b = FLY_ZONES[z];
  return { z, x: x ?? rand(b[0], b[2]), y: y ?? rand(b[1], b[3]), vx: 0, vy: 0, ph: rand(0, TAU), sp: rand(0.55, 1.3),
    wob: rand(0, 500), life: life || 0, age: 0, kick: 0 };
}
function setFlyCount(n) {
  const keep = flies.filter((f) => f.life);
  let perm = flies.filter((f) => !f.life);
  if (perm.length > n) perm = perm.slice(0, n);
  while (perm.length < n) perm.push(makeFly(pickZone()));
  flies.length = 0;
  flies.push(...perm, ...keep);
}

function nearestZone(x, y) {
  let best = 0, bd = 1e9;
  FLY_ZONES.forEach((b, i) => {
    const d = Math.hypot(clamp(x, b[0], b[2]) - x, clamp(y, b[1], b[3]) - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function fireflyBurst(x, y) {
  for (const f of flies) {
    const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy);
    if (d < 34 && d > 0.1) { f.vx += dx / d * 12; f.vy += dy / d * 9; f.kick = 1; }
  }
  const z = nearestZone(x, y);
  for (let i = 0; i < 7; i++) {
    const f = makeFly(z, x + rand(-2, 2), y + rand(-2, 1), rand(6, 10));
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    f.vx = Math.cos(a) * rand(4, 9); f.vy = Math.sin(a) * rand(3, 7); f.kick = 1;
    flies.push(f);
  }
}

function flyStep(f, dt) {
  f.age += dt;
  f.kick = Math.max(0, f.kick - dt * 0.5);
  f.vx += (vnoise(time * 0.35 + f.wob) - 0.5) * 16 * dt;
  f.vy += (vnoise(time * 0.31 + f.wob + 77) - 0.5) * 10 * dt;
  const b = FLY_ZONES[f.z], pull = f.life ? 1.5 : 6;
  if (f.x < b[0]) f.vx += pull * dt; else if (f.x > b[2]) f.vx -= pull * dt;
  if (f.y < b[1]) f.vy += pull * dt; else if (f.y > b[3]) f.vy -= pull * dt;
  if (f.life) f.vy -= 0.8 * dt;
  if (pointer.on) {
    const dx = pointer.x - f.x, dy = pointer.y - f.y, d = Math.hypot(dx, dy);
    if (d < 30 && d > 2) { f.vx += dx / d * 8 * dt; f.vy += dy / d * 8 * dt; }
  }
  f.vx += wind * 1.5 * dt;
  const damp = 1 - 0.9 * dt;
  f.vx *= damp; f.vy *= damp;
  const sp = Math.hypot(f.vx, f.vy);
  if (sp > 9) { f.vx *= 9 / sp; f.vy *= 9 / sp; }
  f.x += f.vx * dt; f.y += f.vy * dt;
}

function flyLight(f) {
  const s = Math.sin(time * f.sp * 1.25 + f.ph);
  let b = clamp(s * 1.7 - 0.45, 0, 1);
  b = Math.max(b * b, f.kick);
  if (f.life) b *= clamp(Math.min(f.age * 3, (f.life - f.age) / 1.5), 0, 1);
  return b * (1 - rainAmt * 0.6);
}

/* ---- maple leaves ------------------------------------------------------------------------------- */

const LEAF = {
  big: ["..1..", "1.1.1", "11211", ".111.", "..3.."],
  mid: [".1.", "111", "121", ".1.", ".3."],
  edge: ["1", "1", "2", "1", "3"],
  flat: ["1.1.1", "11211", ".131."],
  small: ["1.1", "121", ".3."],
  smallEdge: ["1", "2", "3"],
  smallFlat: ["121", ".3."],
};
const LEAF_PALS = [
  [null, [214, 52, 38], [248, 116, 64], [84, 30, 22]],
  [null, [186, 34, 38], [232, 82, 56], [70, 24, 20]],
  [null, [234, 92, 40], [255, 156, 78], [96, 40, 22]],
  [null, [158, 28, 40], [206, 62, 56], [60, 20, 22]],
];
const leaves = [];
let leafAcc = 0;

function spawnLeaf(x, y, vy) {
  if (leaves.length > 60 || !CANOPY.length) return;
  if (x === undefined) { const i = randi(CANOPY.length / 2) * 2; x = CANOPY[i]; y = CANOPY[i + 1]; }
  leaves.push({ x, y, vy: vy ?? rand(1.5, 3.5), term: rand(4.5, 7), ph: rand(0, TAU), sw: rand(2.5, 5.5),
    spin: rand(0, TAU), spinSp: rand(2, 5.5) * (chance(0.5) ? 1 : -1), pal: LEAF_PALS[randi(4)],
    small: chance(0.4), st: 0, t: 0, life: 0 });
}

function leafShower(x, y) {
  for (let i = 0; i < 20; i++) spawnLeaf(x + rand(-12, 12), y + rand(-6, 6), rand(0, 3));
}

function leafStep(l, dt) {
  l.t += dt;
  if (l.st === 0) {
    l.vy += (l.term - l.vy) * dt * 1.2;
    l.spin += l.spinSp * dt;
    l.x += (Math.sin(time * 1.7 + l.ph) * l.sw + wind * 9) * dt;
    l.y += l.vy * dt * (0.7 + 0.4 * Math.abs(Math.cos(l.spin)));
    const fx = Math.round(l.x), fy = Math.round(l.y) + (l.small ? 2 : 4);
    if (l.y > 120) {
      if (isGround(fx, fy) && !inBox(POS.fireBox, fx, fy) && chance(dt * 3)) { l.st = 1; l.t = 0; l.life = rand(10, 22); }
      else if (isWater(fx, fy) && fy > 142 && chance(dt * 2.2)) { l.st = 2; l.t = 0; l.life = rand(14, 28); ripple(fx, fy, 0.4, 5, 4); }
    }
    return l.y < H + 8 && l.x > -10 && l.x < W + 10;
  }
  if (l.st === 2) {
    l.x += (-0.45 + wind * 0.5) * dt;
    if (!isWater(l.x, l.y + (l.small ? 1 : 2))) l.life = Math.min(l.life, l.t + 1);
    if (chance(dt * 0.15)) ripple(l.x, l.y + 1, 0.25, 4, 3);
  }
  return l.t < l.life;
}

function leafDraw(l) {
  let a = 1;
  if (l.st) a = clamp((l.life - l.t) / 2, 0, 1);
  if (l.st === 0) {
    const c = Math.cos(l.spin), ac = Math.abs(c);
    const rows = l.small ? (ac > 0.45 ? LEAF.small : LEAF.smallEdge) : ac > 0.7 ? LEAF.big : ac > 0.3 ? LEAF.mid : LEAF.edge;
    sprite(rows, l.pal, l.x - (rows[0].length >> 1), l.y, a, c < 0);
  } else {
    const rows = l.small ? LEAF.smallFlat : LEAF.flat;
    const bobY = l.st === 2 ? Math.round(Math.sin(time * 1.3 + l.ph) * 0.5) : 0;
    sprite(rows, l.pal, l.x - (rows[0].length >> 1), l.y + (l.small ? 1 : 2) + bobY, a * (l.st === 2 ? 0.85 : 1), l.ph > Math.PI);
  }
}

/* ---- owl ---------------------------------------------------------------------------------------- */

let owl = null;
function owlStart() {
  if (owl || !OWL_SPOTS.length) return;
  const i = randi(OWL_SPOTS.length / 2) * 2;
  owl = { x: OWL_SPOTS[i], y: OWL_SPOTS[i + 1], t: 0, dur: rand(5, 9), look: chance(0.5) ? 1 : 0 };
}

/* ---- step / draw -------------------------------------------------------------------------------- */

function natureStep(dt) {
  for (let i = flies.length - 1; i >= 0; i--) {
    const f = flies[i];
    flyStep(f, dt);
    if (f.life && f.age >= f.life) flies.splice(i, 1);
  }
  leafAcc += dt * (S.leaves / 100) * 0.9 * (1 + gust * 3);
  while (leafAcc >= 1) { leafAcc--; spawnLeaf(); }
  for (let i = leaves.length - 1; i >= 0; i--) if (!leafStep(leaves[i], dt)) leaves.splice(i, 1);
  if (owl && (owl.t += dt) > owl.dur) owl = null;
}

function natureDraw() {
  for (const l of leaves) if (l.st) leafDraw(l);          // resting leaves under the falling ones
  for (const l of leaves) if (!l.st) leafDraw(l);
  for (const f of flies) {
    const b = flyLight(f);
    if (b > 0.02) glowDot(f.x, f.y, FLY_CORE, FLY_HALO, b);
  }
  if (owl) {
    const fade = clamp(Math.min(owl.t / 0.6, (owl.dur - owl.t) / 0.6), 0, 1);
    const open = owl.t % 2.8 < 0.14 || Math.abs(owl.t % 2.8 - 0.3) < 0.07 ? 0 : 1;   // a quick double blink
    const dx = owl.t > owl.dur * 0.5 ? owl.look : 0;                                   // glances aside halfway
    const k = 0.85 * fade * open;
    glow(owl.x + dx, owl.y, [255, 198, 70], k);
    glow(owl.x + 2 + dx, owl.y, [255, 198, 70], k);
  }
}
