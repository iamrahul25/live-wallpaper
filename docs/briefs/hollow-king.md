# The Hollow King — design brief

Live wallpaper, built-in gallery item. Folder: `src-tauri/wallpapers/hollow-king/`.

## 1. One-line pitch

A crowned skull emerges from total darkness as a living field of dithered pixel particles: cobalt shadows, ember-orange light, bone-white highlights. Still subject, restless surface.

## 2. Reference study (what we take, what we don't)

Reference: a 5 s, 1024×1024 GIF of a skull inside a knight's helmet. Measured, not eyeballed:

| Property | Measurement | Our decision |
|---|---|---|
| Pixel grid | Colour changes every 2 px → 512×512 cells | Same density: particles scale with the real screen resolution, 2 px at 1080p and 4 px at 4K, about 540 rows either way (setting 1–4) |
| Background | Pure black, about 15% of cells lit | Same: black canvas, subject carries the frame |
| Palette | navy `#08084a` (most common), royal blue `#3070d0`, steel `#5070b0`, teal `#50b0a0`, orange `#f09030`, tan `#d89a5c`, cream `#f8f8c8`, white | Same family with our own tuned values (section 4), plus presets |
| Colour logic | Shadow and cool light become blue, warm light becomes orange, brightest becomes cream/white, and transition zones mix blue and orange dots | Two-channel shading (warm and cool) mapped to two ramps, with the choice of ramp dithered |
| Dither | Ordered, checkerboard-like patterns; sparse navy dots in the darks | 4×4 Bayer matrix plus temporal noise |
| Motion | Camera and subject static. About 7.6% of cells re-shuffle per update, about 12 updates/s | "Boil": threshold jitter on a 12 Hz tick |
| Extras | Rare horizontal dotted streaks trailing from bright edges; stray teal/green/pink pixels | Glitch streaks and chromatic stray pixels, both rare |

We do **not** take the subject, the composition, the helmet or any frame of the GIF. Everything is generated from code (a 3D signed-distance scene), so the wallpaper is ours to sell.

## 3. Creative prompt

> Close portrait of a dead king: a human skull wearing a heavy, slightly tilted iron crown with tall points and inset gems, wrapped in a dark fur-collared mantle. Lit by a single warm source from the upper right, so the crown, brow and cheekbone catch ember orange and bone white, while everything else falls into cobalt and navy. Faint embers glow deep in the eye sockets. The figure sits right of centre and looks slightly left, into the empty dark. Rendered as a coarse pixel grid with ordered dithering: no gradients, only dots, so the image reads as a field of particles. The particles never sit still; they shimmer like heat, a few embers drift upward, and now and then a scanline tears sideways.

Mood words: regal, hollow, patient, cold fire.

## 4. Palette

Default **Ember & Cobalt** (tuned from the reference family, not copied):

| Role | Hex |
|---|---|
| Void | `#000000` |
| Abyss (dust) | `#0b0a40` |
| Deep cobalt | `#1c3c9c` |
| Cobalt | `#2f6bd8` |
| Steel | `#5c82c8` |
| Verdigris (accent) | `#4fb6a6` |
| Ember | `#f2872c` |
| Amber | `#e8a664` |
| Bone | `#f5eec4` |
| White | `#ffffff` |

Presets in settings: Ember & Cobalt, Bone & Ash (monochrome cream on black), Blood Moon (crimson and navy), Witchfire (acid green and violet), Frost (cyan and white).

## 5. Composition (16:9 desktop)

* Skull centre at about 64% across and 43% down. Crown top at about 6%, chin at about 66%, so the skull spans more than half the screen height; the fur mantle runs off the bottom edge.
* Left 40% of the screen stays black apart from sparse dust, so desktop icons stay readable.
* The skull is turned about 15° toward screen-left and seen slightly from below.
* Settings can move the subject to the centre or the left.

## 6. Motion

| Layer | Behaviour | Rate |
|---|---|---|
| Boil | A slice of cells re-rolls its dither threshold, about 6–9% visible change per tick | 12 Hz (setting 0–100) |
| Flame | The warm key light breathes ±12% with slow noise; the eye glow pulses | Continuous |
| Embers | 40–120 warm particles rise from below the crown and drift with a slow wind, snapped to the grid | Continuous |
| Dust | Sparse abyss-blue dots in the dark that fade in and out | With the boil tick |
| Glitch | 1–4 rows smear sideways as dotted streaks for 2–4 ticks | Every 4–10 s (setting on/off) |

No camera motion, no subject motion: calm enough to live behind work all day.

## 7. Technical plan

WebGL2, one file, no libraries, no image assets.

1. **Bake** (on load or resize only): raymarch the SDF scene (skull, crown, mantle) at grid resolution into a texture holding the warm-key term (diffuse × soft shadow × AO), the cool fill+rim term, the eye glow and the gem glow. Baked in horizontal strips, two strips per frame from the top down, so no draw trips the GPU watchdog and the king materialises in well under a second instead of stalling the first frame.
2. **Light pass** (per frame, grid resolution): flame flicker, eye pulse → warm and cool intensities.
3. **Embers** (per frame): points drawn additively into the light buffer, one particle each; the count scales with the grid so the look holds at every particle size.
4. **Palette pass** (per frame, grid resolution): pick a ramp per cell (dithered by warmth), dither between ramp levels with Bayer 4×4 plus the boil jitter, glitch streaks, stray pixels, twinkling dust.
5. **Upscale**: nearest-neighbour `blitFramebuffer` to the screen, so each cell is a crisp square.

Resolution: grid = screen ÷ particle size, where particle size = setting × (screen height ÷ 1080). FHD and 4K both run a 960×540 grid at the default, so 4K costs the same as FHD. Only the finest setting (1) at 4K raises it to 1920×1080.

Budget: the heavy 3D work happens once; per frame is three cheap grid-sized passes plus one copy. 30 fps default cap (the boil runs at 12 Hz anyway).

Hooks, same as the other wallpapers: `?still`, `?q=`, `?fps=`, `window.__lwSettings`, `livelyPropertyListener`, `livelyWallpaperPlaybackChanged`, pause when hidden, 30 fps cap on battery.

## 8. Settings (LivelyProperties)

Palette (dropdown), Particle size (1–4, scales with resolution, default 2), Particle shimmer (0–100), Embers (on/off), Glitch (on/off), Subject position (Right / Centre / Left), Frame rate cap (12–60).

## 9. Deliverables

`index.html`, `wallpaper.json`, `LivelyInfo.json`, `LivelyProperties.json`, `thumb.jpg` (640×360, rendered from `?still`).

## 10. Acceptance checklist

* Reads as a crowned skull at thumbnail size and at 4K.
* At a glance the palette sits in the same family as the reference, yet no frame resembles it.
* Left side calm enough for white icon labels.
* No visible banding: every gradient is dots.
* Idle cost low enough to forget it is running.
