/*
 * world.js — the map of the painting and the small helpers everything else shares.
 *
 * All positions are ART CELLS: the painting's own pixels, 418 x 235, x right, y DOWN, (0,0) top-left.
 * One art cell becomes one canvas pixel; CSS scales the canvas up with nearest-neighbour filtering.
 *
 * Defines: W, H, TAU, POS, rnd, rand, randi, chance, hash1, vnoise, lerp,
 *          sceneImg, maskImg, loadArt(), isWater, isSky, isGround, lumAt, inBox, CANOPY, OWL_SPOTS
 * Uses:    ART_W, ART_H, SCENE_URI, MASK_URI (assets.js), params (config.js)
 */
"use strict";

const W = ART_W, H = ART_H, TAU = Math.PI * 2;

// Landmarks, in art cells. Boxes are [x0, y0, x1, y1].
const POS = {
  moon: { x: 97.5, y: 35, r: 9.3 },
  fire: { x: 258.5, y: 166 },          // where embers and smoke leave the flame
  fireBox: [246, 150, 272, 181],
  bobber: { x: 208, y: 160, line: 164, cx: 209.5 },   // float's top-left, waterline row, centre x
  lineTop: { x: 212, y: 157 },         // where the painted fishing line meets the erased float
  tent: [333, 98, 392, 162],
  boy: [275, 106, 332, 178],
  lake: [105, 150, 245, 212],          // where fish jump on their own
};

// Seeded random numbers, so ?still frames are identical every run.
let seed = (+params.get("seed") || 20251125) >>> 0;
function rnd() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand = (a, b) => a + (b - a) * rnd();
const randi = (a, b) => (b === undefined ? Math.floor(rnd() * a) : Math.floor(a + (b - a) * rnd()));
const chance = (p) => rnd() < p;
const lerp = (a, b, t) => a + (b - a) * t;
function hash1(n) { const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); }
function vnoise(x) {             // smooth 1D value noise, 0..1
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u);
}
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

let sceneImg = null, maskImg = null, SCENE_PX = null, MASK_PX = null;
const CANOPY = [];      // flat [x, y, ...] of red leaf cells in the maple: where falling leaves start
const OWL_SPOTS = [];   // flat [x, y, ...] of dark cells deep in the left pines: where the owl looks out

const cellIndex = (x, y) => {
  x = Math.round(x); y = Math.round(y);
  return x < 0 || y < 0 || x >= W || y >= H ? -1 : (y * W + x) * 4;
};
const isWater = (x, y) => { const i = cellIndex(x, y); return i >= 0 && MASK_PX[i] > 127; };
const isSky = (x, y) => { const i = cellIndex(x, y); return i >= 0 && MASK_PX[i + 1] > 127; };
const isGround = (x, y) => { const i = cellIndex(x, y); return i >= 0 && MASK_PX[i + 2] > 127; };
const lumAt = (x, y) => {
  const i = cellIndex(x, y);
  return i < 0 ? 0 : SCENE_PX[i] * 0.299 + SCENE_PX[i + 1] * 0.587 + SCENE_PX[i + 2] * 0.114;
};

function loadImage(src) {
  return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
}
function pixelsOf(img) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, W, H).data;
}

async function loadArt() {
  [sceneImg, maskImg] = await Promise.all([loadImage(SCENE_URI), loadImage(MASK_URI)]);
  SCENE_PX = pixelsOf(sceneImg);
  MASK_PX = pixelsOf(maskImg);
  for (let y = 2; y < 72; y++) {
    for (let x = 186; x < W; x++) {
      const i = (y * W + x) * 4, r = SCENE_PX[i], g = SCENE_PX[i + 1];
      if (r > 110 && r > g * 1.8) CANOPY.push(x, y);
    }
  }
  for (let y = 72; y < 128; y += 2) {
    for (let x = 4; x < 88; x += 2) {
      let dark = true;
      for (let dy = -2; dy <= 2 && dark; dy++) for (let dx = -2; dx <= 4 && dark; dx++) if (lumAt(x + dx, y + dy) > 9) dark = false;
      if (dark) OWL_SPOTS.push(x, y);
    }
  }
}
