# Koi Pond

A sunlit Japanese garden pond seen from above: koi, lily pads, lotus, caustics, ripples, and click-to-feed.
It uses raw WebGL2, with no libraries and no image assets.

## Files

The page is plain **classic scripts** that share one global scope. They are not ES modules, so the page still
runs from `file://` (Lively, or double-clicking `index.html`). `index.html` loads them in a fixed order. A file may
use anything defined by the files above it. The header of each file lists what it **Defines** and what it **Uses**.

| # | File | What it does |
|---|------|--------------|
| 1 | `js/config.js` | URL options, quality `PRESETS`, the live settings object `S`, saved Customize values (`window.__lwProps`) |
| 2 | `js/shaders/common.js` | GLSL shared by every program (`COMMON`): constants, noise, `shoreBand`, colour grade; `VS_FULL` |
| | `js/shaders/bed.js` | `FS_BED`: pond floor, rocks, pebbles, plants, baked once per resize |
| | `js/shaders/water.js` | `FS_SIM` ripple wave equation, `FS_CAUS` surface slopes + caustics |
| | `js/shaders/koi.js` | `VS_FISH`, `FISH_SHAPE`, `FS_FISH`: koi body, fins, the 7 varieties, koi shadows |
| | `js/shaders/composite.js` | `FS_COMP`: final pass (refraction, water colour, reflections, glints) |
| | `js/shaders/lily-pads.js` | `VS_PAD`, `FS_PAD`: instanced lily pads |
| | `js/shaders/lotus.js` | `VS_LOTUS`, `FS_LOTUS`: lotus flowers, their shadows and reflections, fallen petals |
| | `js/shaders/points.js` | `VS_PTS`, `FS_PTS`: pollen, duckweed, motes, bubbles, food pellets |
| 3 | `js/world.js` | JS math helpers, world aspect `A`, the JS copy of `shoreBand`, seeded `rnd` |
| | `js/gl.js` | GL state (`gl`, `P`, `B`, `T`, sizes), shader compile, uniform and texture helpers |
| | `js/scene.js` | Seeded layout of pads, lotus, petals, specks and motes, then the instance-buffer upload |
| 4 | `js/koi.js` | Koi data and behaviour: varieties, `makeFish`, `setFishCount`, modes, steering, icon avoidance |
| | `js/food.js` | Feeding: `feedAt` (click), pellets drifting, koi choosing and eating pellets |
| | `js/koi-mesh.js` | `buildFish`: bends each koi along its swum path into a triangle strip |
| | `js/simulation.js` | `step(dt)`: advances the whole world, and the ripple sim pass with its wave sources |
| | `js/render.js` | `render()`: the 5 draw passes for a frame |
| 5 | `js/setup.js` | `init()` (context, programs, buffers), `resize()` (render targets, re-bake), `bakeBed()` |
| | `js/loop.js` | Frame loop: FPS cap, pause, adaptive resolution, `setQuality` |
| | `js/host.js` | Hooks for the app, Lively and browsers (`__lwSettings`, `livelyPropertyListener`, `__lwClick` ...) |
| | `js/main.js` | Boot. Must stay last. |

## Frame pipeline

```
bed      (once per resize) rocks, pebbles, silt and water plants baked into 3 textures
ripple   height-field wave equation; koi, drips, bubbles and food push it
caustic  analytic wind waves + ripples -> refraction slopes and caustics
shadow   koi, lily pads and lotus cast soft shadows on the pond floor
koi      deformable meshes, shaded in the fragment shader, tinted by their depth
final    refraction, plants, caustics, water volume, sky reflection, sun glints, rocks
overlay  lily pads, lotus (+ shadows, reflections), fallen petals, pollen, duckweed, food
```

## Customization (settings contract)

`LivelyProperties.json` declares the controls that the app's **Customize** panel shows. Lively reads the same file.

| Name | Control | Values | Effect (`S` key) |
|------|---------|--------|------------------|
| `quality` | dropdown | 0 Low, 1 Medium, 2 High, 3 Ultra | render resolution, buffer sizes, ripple grid (`S.quality`) |
| `fps` | slider | 20 – 144 | frame-rate cap (`S.fps`) |
| `koi` | slider | 1 – 14 | number of koi (`S.fish`) |
| `lotus` | checkbox | true / false | lotus flowers (`S.lotus`) |
| `calmLeft` | checkbox | true / false | calmer left side, and koi keep clear of desktop icons (`S.calm`) |

How the values reach the page:

1. **Before the scripts run**, the app injects `window.__lwProps = { <saved values> }`. `config.js` builds `S` from it.
2. **After load**, the app calls `livelyPropertyListener(name, value)` once for each saved value.
3. **Live changes**: the app calls `livelyPropertyListener(name, value)` on the desktop wallpaper. The preview
   in the Customize panel gets it by `postMessage({ type: "lw:property", name, value })`.

To add a setting: add it to `LivelyProperties.json`, read it into `S` in `config.js` (from `SAVED`), and handle
it in `livelyPropertyListener` in `host.js`.

## Testing

```
python -m http.server 5178 --directory src-tauri/wallpapers
http://localhost:5178/koi-pond/index.html?still&t=24&q=medium      one settled, deterministic frame
http://localhost:5178/koi-pond/index.html?debug                    window.__lwStep(n, dt) for manual stepping
```

Runs are seeded, so `?still` frames come out pixel-identical every time. That makes them useful to confirm that
a refactor changed nothing.
