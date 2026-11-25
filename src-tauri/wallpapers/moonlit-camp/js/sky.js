/*
 * sky.js — the night sky: extra twinkling stars, shooting stars, thin cloud wisps that drift across
 * the moon (dimming it and its path on the lake), bats, and the moon's flare when clicked.
 *
 * Everything here is drawn only on open-sky cells (the G mask), so it passes behind the pines, the
 * mountains and the maple instead of over them. Bats are the exception: they fly in front.
 *
 * Defines: moon, skyInit(), skyStep(dt), skyDraw(), meteor(x, y), meteorSomewhere(), batFlight(), moonFlare()
 * Uses:    world.js helpers, fx.js drawing, time, wind
 */
"use strict";

const moon = { flash: 0, dim: 0 };
const stars = [], meteors = [], wisps = [], bats = [], glints = [];
const WISP_TOP = [72, 100, 168], WISP_BODY = [30, 48, 98], WISP_LOW = [20, 34, 76];
const BAT_FRAMES = [["1...1", ".111."], ["11.11", "..1.."], [".111.", "1...1"]];
const BAT_PAL = [null, [9, 9, 20]];

function skyInit() {
  for (let n = 0; n < 900 && stars.length < 48; n++) {
    const x = randi(W), y = randi(4, 80);
    if (!isSky(x, y) || lumAt(x, y) > 34 || Math.hypot(x - POS.moon.x, y - POS.moon.y) < 18) continue;
    stars.push({ x, y, b: rand(0.12, 0.5) ** 1.4, sp: rand(0.5, 2.2), ph: rand(0, TAU) });
  }
  wisps.push(makeWisp(rand(120, 200)), makeWisp(rand(300, 380)));
}

function makeWisp(x) {
  const w = randi(30, 66), top = [], s = rnd() * 100;
  for (let i = 0; i < w; i++) {
    const u = i / (w - 1), env = Math.pow(Math.sin(Math.PI * u), 0.6);
    top.push(Math.max(0, Math.round(env * (1.2 + 3.2 * vnoise(i * 0.17 + s)))));
  }
  return { x, y: randi(16, 60), w, top, sp: rand(0.8, 1.4) };
}

function meteor(x, y) {
  const dir = x > 200 ? -1 : chance(0.5) ? -1 : 1, ang = rand(0.22, 0.5), sp = rand(75, 110);
  meteors.push({ x, y, vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, sp, age: 0, life: rand(0.9, 1.4), len: randi(16, 27) });
}
function meteorSomewhere() { meteor(rand(20, 330), rand(2, 24)); }

function batFlight() {
  const dir = chance(0.5) ? 1 : -1, y0 = rand(20, 52), n = randi(1, 4);
  for (let i = 0; i < n; i++) {
    bats.push({ x: dir > 0 ? -6 - i * rand(7, 16) : 330 + i * rand(7, 16), y0: y0 + rand(-7, 7), dir, sp: rand(24, 34), ph: rand(0, TAU), amp: rand(2, 5) });
  }
}

function moonFlare() {
  moon.flash = 1;
  for (let i = 0; i < 7; i++) {
    const a = rand(0, TAU), r = rand(13, 24);
    glints.push({ x: POS.moon.x + Math.cos(a) * r, y: POS.moon.y + Math.sin(a) * r * 0.9, age: -i * 0.09, life: rand(0.7, 1.2) });
  }
  if (chance(0.5)) after(0.4, meteorSomewhere);
}

function skyStep(dt) {
  moon.flash = Math.max(0, moon.flash - dt * 0.55);
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.age += dt; m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.age >= m.life) meteors.splice(i, 1);
  }
  for (let i = glints.length - 1; i >= 0; i--) if ((glints[i].age += dt) >= glints[i].life) glints.splice(i, 1);

  // wisps drift right to left; they enter from behind the maple and leave past the left edge
  let cover = 0;
  for (let i = 0; i < wisps.length; i++) {
    const w = wisps[i];
    w.x -= (w.sp + wind * 0.5) * dt;
    if (w.x + w.w < -4) { wisps[i] = makeWisp(rand(300, 420)); continue; }
    // how much of the moon's disc this wisp hides
    const M = POS.moon;
    if (w.x < M.x + M.r && w.x + w.w > M.x - M.r && w.y >= M.y - M.r - 6 && w.y - 6 <= M.y + M.r) {
      let hit = 0, all = 0;
      for (let y = M.y - M.r; y <= M.y + M.r; y += 2) {
        for (let x = M.x - M.r; x <= M.x + M.r; x += 2) {
          if (Math.hypot(x - M.x, y - M.y) > M.r) continue;
          all++;
          const c = Math.round(x - w.x);
          if (c >= 0 && c < w.w && y <= w.y + 0.5 && y > w.y - w.top[c] - 0.5) hit++;
        }
      }
      cover = Math.max(cover, all ? hit / all : 0);
    }
  }
  moon.dim = lerp(moon.dim, cover * 0.8, Math.min(1, dt * 1.5));

  for (let i = bats.length - 1; i >= 0; i--) {
    const b = bats[i];
    b.x += b.dir * b.sp * dt;
    if (b.x < -12 || b.x > 345) bats.splice(i, 1);
  }
}

function skyDraw() {
  // cloud wisps first, so the stars can check whether a wisp is in front of them
  for (const w of wisps) {
    const x0 = Math.round(w.x);
    for (let i = 0; i < w.w; i++) {
      const h = w.top[i], x = x0 + i;
      for (let k = 0; k < h; k++) {
        const y = w.y - k;
        if (!isSky(x, y)) continue;
        if (k === h - 1) put(x, y, WISP_TOP, 0.55);
        else if (k === 0) { if (bayer(x, y) < 0.6) put(x, y, WISP_LOW, 0.4); }
        else put(x, y, WISP_BODY, 0.5);
      }
    }
  }
  for (const s of stars) {
    const i = (s.y * W + s.x) * 4;
    if (FX[i + 3] > 70) continue;
    const tw = 0.5 + 0.5 * Math.sin(time * s.sp + s.ph);
    glow(s.x, s.y, [200, 214, 255], s.b * (0.35 + 0.65 * tw * tw));
  }
  for (const m of meteors) {
    const fade = Math.min(1, m.age / 0.1) * Math.pow(1 - m.age / m.life, 0.6);
    const ux = m.vx / m.sp, uy = m.vy / m.sp;
    if (isSky(m.x, m.y)) glowDot(m.x, m.y, [255, 255, 255], [170, 200, 255], fade);
    const len = m.len * Math.min(1, m.age / 0.25);   // the tail grows out behind the head
    for (let k = 1; k <= len; k++) {
      const x = m.x - ux * k, y = m.y - uy * k, a = fade * Math.pow(1 - k / len, 1.3);
      if (isSky(x, y)) glow(x, y, k < 4 ? [235, 240, 255] : [150, 188, 255], a);
      if (k < len * 0.4 && isSky(x, y + 1)) glow(x, y + 1, [110, 150, 255], a * 0.3);
    }
  }
  for (const g of glints) {
    if (g.age < 0) continue;
    const k = Math.sin(Math.PI * g.age / g.life);
    glowDot(g.x, g.y, [235, 242, 255], [140, 170, 255], k);
    if (k > 0.6) { glow(g.x - 2, g.y, [140, 170, 255], k * 0.25); glow(g.x + 2, g.y, [140, 170, 255], k * 0.25); glow(g.x, g.y - 2, [140, 170, 255], k * 0.25); glow(g.x, g.y + 2, [140, 170, 255], k * 0.25); }
  }
  for (const b of bats) {
    const f = BAT_FRAMES[Math.floor(time * 10 + b.ph) % 3];
    const y = b.y0 + Math.sin(b.x * 0.09 + b.ph) * b.amp + Math.sin(time * 3.1 + b.ph) * 1.2;
    sprite(f, BAT_PAL, b.x - 2, y, 0.95, b.dir < 0);
  }
}
