# Moonlit Camp

A pixel-art night by a lake: a boy fishes beside his campfire under a red maple, with his tent glowing behind him.
The moon shines on the water, fireflies drift, and leaves fall. Clicking the scene makes things happen.
It uses raw WebGL2, with no libraries.

The painting is the source art in `tools/moonlit-camp/source.webp` (1672x941, drawn on a 4 px grid).
`tools/moonlit-camp/bake.py` snaps it to its real **418 x 235** pixel grid and builds the masks. Then it writes both as
data URIs into `js/assets.js`. Data URIs keep WebGL working from `file://`. Re-run the script after you change the
art or a mask outline:

```
python tools/moonlit-camp/bake.py [debug_dir]     # debug_dir gets grid.png and masks.png previews
```

## How it draws

The canvas has exactly one pixel per **art cell** (418 x 235 at 16:9). CSS scales it up with `image-rendering: pixelated`,
so every effect sits on the painting's own pixel grid and nothing is blurred. On other screen shapes the
painting covers the screen and is cropped. `FOCUS` in `gl.js` keeps the moon on ultrawide screens and the fire
on tall ones.

Each frame:

```
js     every effect draws into two 418x235 pixel layers (fx.js):  FX = solid things,  GLOW = added light
shader per art cell: erase the painted float -> lake rows slide sideways, moon-path sparkle -> procedural
       flame -> fire light, tent glow, moon halo, twinkling stars, blinking painted fireflies, mist
       -> FX over it -> GLOW added
```

The work is about 0.5 ms per frame. The default cap is 30 FPS.

## Files

Plain classic scripts that share one global scope. `index.html` loads them in this order.

| File | What it does |
|------|--------------|
| `js/assets.js` | GENERATED: the art and the masks as data URIs |
| `js/config.js` | URL options, saved Customize values, the live settings object `S` |
| `js/world.js` | Landmarks (`POS`), seeded random numbers, noise, mask lookups (`isWater`, `isSky`, `isGround`), canopy and owl spots |
| `js/fx.js` | The FX and GLOW pixel layers and how to draw into them: `put`, `glow`, `glowDot`, `line`, `sprite` |
| `js/fire.js` | Fire and tent light flicker (14 Hz), embers, smoke, the click flare |
| `js/water.js` | Ripples, splash droplets, the fishing float (bob, nibble, bite), jumping fish, rain |
| `js/sky.js` | Extra stars, shooting stars, cloud wisps that dim the moon, bats, the moon flare |
| `js/nature.js` | Fireflies, falling maple leaves, the owl |
| `js/events.js` | Wind and gusts, timed idle events, what a click does |
| `js/gl.js` | WebGL2 setup, the composite shader, sizing, `render()` |
| `js/loop.js` | Clock, `step(dt)`, `drawAll()`, frame loop with FPS cap, pause |
| `js/host.js` | Hooks for the app, Lively and browsers |
| `js/main.js` | Boot. Must stay last. |

## Masks

| Channel | Meaning | Used for |
|---------|---------|----------|
| R | open water | lake shimmer, ripples, leaves that float, fish, rain rings |
| G | open sky | stars, shooting stars and wisps. They pass *behind* the pines, mountains and maple |
| B | grass bank | where falling leaves come to rest |

## Clicks

| Where | What happens |
|-------|--------------|
| the float or the boy | A fish bites. The float is pulled under, with a splash and rings. Sometimes a fish leaps out |
| the campfire | Sparks burst up, the flame flares, and the light flashes across the bank |
| the moon | The moon flares and glints sparkle around it, sometimes followed by a shooting star |
| the tent | Its glow pulses and fireflies nearby light up |
| the lake | Ripples and a splash. Sometimes a fish jumps nearby |
| open sky | A shooting star starts where you clicked |
| the maple | A shower of leaves |
| anywhere else | Fireflies scatter and new ones rise from the spot |

The host forwards desktop clicks as `window.__lwClick(x, y)` (`"usesClicks": true` in `wallpaper.json`).
In a browser, the mouse also pulls nearby fireflies toward it.

On their own, the float bobs and nibbles, gusts shake leaves loose, and wisps cross the moon. With **events** on,
shooting stars, jumping fish, bats and the owl's eyes also appear from time to time.

## Customization

| Name | Control | Values | Effect (`S` key) |
|------|---------|--------|------------------|
| `leaves` | slider | 0 – 100 | how many leaves fall (`S.leaves`) |
| `fireflies` | slider | 0 – 80 | number of fireflies (`S.fireflies`) |
| `weather` | dropdown | 0 Clear, 1 Drizzle, 2 Rain | rain streaks, rings on the lake, darker night, dimmer fire (`S.weather`) |
| `mist` | checkbox | true / false | low mist over the lake (`S.mist`) |
| `events` | checkbox | true / false | shooting stars, jumping fish, bats, owl (`S.events`) |
| `clicks` | checkbox | true / false | react to desktop clicks (`S.clicks`) |
| `fps` | slider | 15 – 60 | frame-rate cap (`S.fps`) |

Values arrive the same way as for koi-pond: `window.__lwProps` before load, then `livelyPropertyListener(name, value)`.

## Testing

```
python -m http.server 5178 --directory src-tauri/wallpapers
http://localhost:5178/moonlit-camp/index.html?still&t=30     one settled, deterministic frame
http://localhost:5178/moonlit-camp/index.html?debug          window.__lwStep(n, dt) for manual stepping
window.__lwInteract(x, y)                                     click at art cell (x, y), e.g. (258, 168) = fire
```
