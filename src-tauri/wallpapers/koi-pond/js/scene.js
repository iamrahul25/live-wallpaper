/*
 * scene.js — places lily pads, lotus, fallen petals, pollen, duckweed and motes.
 *
 * Seeded (mulberry32(9137)), so the composition is the same on every run and screen.
 * Pads and flowers stay on the right; the left is kept clear for desktop icons.
 *
 * Defines: pads, lotus, petals, specks, motes, layout(), uploadScene() (writes instance buffers in B)
 * Uses:    A, shoreBand, mulberry32 (world.js), gl, B (gl.js)
 */
"use strict";

let pads = [], lotus = [], petals = [], specks = [], motes = [];
function layout() {
  const R = mulberry32(9137);
  pads = []; lotus = []; petals = []; specks = []; motes = [];
  const clusters = [
    { x: A - .31, y: .15, r: .17, n: 10, fl: [[-.03, .03, 1, .060], [.075, -.055, .55, .040]] },
    { x: A - .215, y: .54, r: .085, n: 4, fl: [[0, .015, .95, .052]] },
    { x: A - .52, y: .87, r: .15, n: 8, fl: [[.02, -.005, 1, .058], [-.10, .055, .5, .036]] },
    { x: A * .47, y: 1.0, r: .09, n: 4, fl: [] },
    { x: A * .63, y: .0, r: .07, n: 3, fl: [] },
  ];
  const tryPad = (x, y, rad) => {
    if (shoreBand(x, y) > -rad * .55 || x < .34) return false;
    if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < .8 * (p.r + rad))) return false;
    pads.push({ x, y, r: rad, rot: R() * 6.283, seed: R() * 50, notch: R() * 6.283, kind: R() < .12 ? .9 + .1 * R() : R() * .78, age: R() });
    return true;
  };
  for (const c of clusters) {
    let placed = 0, tries = 0;
    while (placed < c.n && tries++ < 250) {
      const ang = R() * Math.PI * 2, rr = Math.sqrt(R()) * c.r;
      const rad = (.036 + .040 * Math.pow(R(), .7)) * (1 - .3 * rr / c.r);
      if (tryPad(c.x + Math.cos(ang) * rr * 1.1, c.y + Math.sin(ang) * rr * .8, rad)) placed++;
    }
    for (const f of c.fl) {
      let x = c.x + f[0], y = c.y + f[1];
      for (let k = 0; k < 8 && shoreBand(x, y) > -f[3] * .6; k++) x -= .03;
      lotus.push({ x, y, s: f[3], open: f[2], rot: R() * 6.283, seed: R() * 50, hue: R(), h: .022 + .016 * f[2] });
    }
  }
  [[A - .15, .35, .040], [A - .19, .73, .045], [A * .40, .975, .034]].forEach(([x, y, r]) => tryPad(x, y, r));
  for (const [x, y] of [[A - .45, .30], [A - .62, .62], [A * .62, .78], [A - .36, .44], [A * .70, .22]])
    petals.push({ x, y, s: .016 + .006 * R(), rot: R() * 6.283, seed: R() * 50 });
  const water = (x, y) => shoreBand(x, y) < -.01;
  for (let i = 0, n = 0; i < 400 && n < 45; i++) {          // pollen
    const x = A * (.32 + .6 * R()), y = R();
    if (water(x, y)) { specks.push([x, y, R() * 50, 0]); n++; }
  }
  for (let i = 0, n = 0; i < 900 && n < 60; i++) {          // duckweed drifts in little rafts by the leaves and stones
    const c = clusters[(R() * clusters.length) | 0];
    const near = R() < .35;
    const x0 = near ? A - .17 - .08 * R() : c.x + (R() - .5) * c.r * 2.6;
    const y0 = near ? R() : c.y + (R() - .5) * c.r * 2;
    for (let k = 0, m = 2 + (R() * 5 | 0); k < m && n < 60; k++) {
      const x = x0 + (R() - .5) * .025, y = y0 + (R() - .5) * .025;
      if (x > .36 && water(x, y)) { specks.push([x, y, R() * 50, 1]); n++; }
    }
  }
  for (let i = 0; i < 45; i++) motes.push([A * (.2 + .8 * R()), R(), R() * 50, 0]);
}
function uploadScene() {
  const pd = new Float32Array(pads.length * 8);
  pads.forEach((p, i) => pd.set([p.x, p.y, p.r, p.rot, p.seed, p.notch, p.kind, p.age], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, B.padInst); gl.bufferData(gl.ARRAY_BUFFER, pd, gl.STATIC_DRAW);
  const ld = new Float32Array(lotus.length * 8);
  lotus.forEach((l, i) => ld.set([l.x, l.y, l.s, l.rot, l.seed, l.open, l.hue, l.h], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, B.lotusInst); gl.bufferData(gl.ARRAY_BUFFER, ld, gl.STATIC_DRAW);
  const fd = new Float32Array(petals.length * 8);
  petals.forEach((p, i) => fd.set([p.x, p.y, p.s, p.rot, p.seed, 1, 0, 0], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, B.petalInst); gl.bufferData(gl.ARRAY_BUFFER, fd, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, B.specks); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(specks.flat()), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, B.motes); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(motes.flat()), gl.STATIC_DRAW);
}
