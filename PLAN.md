# Live Wallpaper: plan and tech stack

Working title: **Live Wallpaper**. Rename before the Store submission, and don't use "Lively" in the name, logo or listing.

## 1. What we're building

A small Windows app that puts an interactive **HTML/CSS/JS page behind the desktop icons**, plus a library UI where you browse, preview, add and switch wallpapers. That's the core of Lively Wallpaper. Lively's web wallpapers really are just web pages rendered in a WebView, so your guess was right.

## 2. Tech stack: Tauri v2 (confirmed)

| Layer | Choice | Why |
|---|---|---|
| Shell / backend | **Tauri v2 + Rust** | Uses the OS's WebView2 instead of bundling Chromium, so the installer is about 3–6 MB (Electron is about 80–150 MB). |
| Desktop embedding | Rust + `windows` crate (Win32) | Reparents the wallpaper window into `Progman`/`WorkerW`, behind the desktop icons. This is the same trick Lively uses. |
| Wallpaper rendering | WebView2 (built into Windows 10/11) | Every wallpaper is a plain web page, so anyone can make one. |
| UI | **Plain HTML/CSS/JS, no framework** | No build step and the smallest bundle. Move to Svelte/Solid later if the UI grows. |
| Wallpaper serving | Custom protocol `lw://` (`http://lw.localhost/...`) | Built-in and user wallpapers load the same way, isolated from the app's own IPC. |
| Packaging | MSI/NSIS now, **MSIX for the Store** | See section 6. |
| Dev launcher | `app.py` (Python menu) | 1 = run, 2 = build, 0 = exit, and more. |

Footprint, honestly: the installer is small, but **RAM** comes from WebView2 (about 80–150 MB while a wallpaper runs). That's the same as Lively. We keep it low by pausing or throttling (section 5).

## 3. Architecture

```
┌──────────── Live Wallpaper.exe (Rust, Tauri) ────────────┐
│  main window (library UI)      wallpaper window (no frame)│
│  src/index.html ── invoke ──►  set_wallpaper(id)          │
│                                 │                         │
│                                 ▼                         │
│        desktop.rs: Progman ─0x052C─► WorkerW              │
│        SetParent(wallpaper, WorkerW / Progman)            │
│                                                           │
│  lw:// protocol ─► <resources>/wallpapers/<id>/  (built-in)│
│                 └► %APPDATA%/…/wallpapers/<id>/  (user)    │
│  tray icon: Open · Stop wallpaper · Quit                  │
└───────────────────────────────────────────────────────────┘
```

* Closing the main window **hides it to the tray**, and the wallpaper keeps running.
* The active wallpaper is saved in `settings.json` and restored on the next launch.
* Windows 11 24H2+ changed the desktop window tree (`WorkerW` is now a child of `Progman`). `desktop.rs` handles both the old and new layouts.

### Wallpaper format (v1)

```
my-wallpaper/
  index.html             (required)
  wallpaper.json         (optional) { "title", "description", "accent": ["#hex", "#hex"], "usesIcons", "usesClicks" }
  LivelyProperties.json  (optional) Customize-panel controls, Lively's format (slider, checkbox, dropdown, color, textbox, label)
  any .js/.css/images
```

**Customization.** When `LivelyProperties.json` exists, the library shows a Customize panel with a live preview. Saved values live in `settings.json` under `properties.<id>`. The app injects `src-tauri/src/bridge.js` at the top of every wallpaper's `index.html` that it serves. The bridge sets `window.__lwProps` (the saved values, before the page's scripts run), calls `livelyPropertyListener(name, value)` once for each saved value on load, and forwards the preview's `postMessage({ type: "lw:property", name, value })`. Live changes reach the desktop wallpaper through `eval` of `livelyPropertyListener`. A wallpaper only has to implement `livelyPropertyListener`, which is the same thing Lively needs. `koi-pond/README.md` is the worked example.

## 4. Milestones

**M1 — MVP (this scaffold)**
- [x] Tauri v2 project, tray, hide to tray
- [x] Library UI: sidebar (All / Gallery / My Wallpapers), search, grid, hover preview
- [x] Set or stop a wallpaper behind the desktop icons (old and new Win11 layouts)
- [x] Import an `.html` file or a folder, delete user wallpapers
- [x] 4 built-in wallpapers (Icon Islands, Koi Pond, Particle Network, Starfield), remembers the last wallpaper
- [x] `app.py` dev menu

**M2 — Quality and performance (needed before the Store)**
- Pause the wallpaper when a fullscreen app or game is running, or on battery (detect the foreground window, then call `TrySuspend` or a JS `visibilitychange`)
- FPS cap and a "pause when the desktop is covered" option
- Multi-monitor: pick the monitor, span or duplicate
- Mouse input passthrough to the wallpaper: **left clicks done** (opt-in `"usesClicks": true` in `wallpaper.json`; `input.rs` installs a low-level mouse hook only while such a wallpaper runs and calls `window.__lwClick(x, y)`; Koi Pond uses it to sprinkle fish food). Still to do: mouse move, other buttons, multi-monitor
- Start with Windows (MSIX `StartupTask`)
- Single instance (`tauri-plugin-single-instance`)

**M3 — Features that make it worth money**
- [x] Customize panel per wallpaper (`LivelyProperties.json` gives sliders, dropdowns, switches and colours, with a live preview; values are saved and sent to the page). Koi Pond and Hollow King have one; Neon Rain still needs a `LivelyProperties.json`
- Video wallpapers (`<video>` inside the WebView, so no extra engine is needed)
- Online gallery (a static JSON on GitHub Pages or a CDN, downloaded on demand to keep the installer small)
- Audio-reactive wallpapers (WASAPI loopback, then data posted to the page)
- Playlists or switch on a timer

**M4 — Store launch**
- MSIX packaging, Store listing, screenshots, privacy policy page

## 5. Keeping it lightweight

1. One WebView for the wallpaper, created only while one is active. It's destroyed when stopped.
2. Release build: `opt-level="s"`, LTO, strip, `panic=abort`, so the exe is about 3–5 MB.
3. Built-in wallpapers use canvas and CSS only, with no libraries.
4. M2 pausing logic. This matters most, because users notice battery drain.
5. WebView2 is preinstalled on Win10 21H2+ and Win11, so we don't bundle it.

## 6. Microsoft Store and money

* **Developer account:** Microsoft made individual registration free in 2025, and companies pay a one-time fee. Check the current rules when you sign up at https://storedeveloper.microsoft.com.
* **Packaging:** the Store accepts MSI/EXE (you host the installer and need your own code-signing certificate, about $200+/year) **or MSIX** (Microsoft signs it for free). **Recommendation: MSIX.** Package the Tauri release build with the MSIX Packaging Tool, or with `makeappx` and an `AppxManifest.xml`. MSIX also gives package identity, which the Store purchase API needs.
* **Monetization options**
  1. **Freemium (recommended):** free app with 6–10 wallpapers, plus a "Pro" in-app purchase (one-time $2.99–4.99) for the premium gallery, customize panel, playlists and audio-reactive wallpapers. Uses `Windows.Services.Store` from Rust through the `windows` crate.
  2. Paid upfront ($1.99) with a free trial. Simpler, but gets fewer installs.
  3. Donations or Ko-fi link only. Lively is free and open source, so a paid clone needs a clear extra, like the premium gallery or better pausing.
* **Store requirements to plan for:** privacy policy URL, age rating questionnaire, screenshots (1366×768+), it must not change system settings without consent (we only add a window, which is fine), and it must clean up on uninstall.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Windows updates change the desktop window tree again | Both layouts are handled. Keep it isolated in `desktop.rs` and test each Windows release. |
| RAM or battery complaints | M2 pausing, FPS cap |
| Copyright of gallery wallpapers | Only ship wallpapers we made or that have a permissive license, and credit the authors |
| Explorer restart kills the WorkerW | Listen for `TaskbarCreated` and re-attach (M2) |

## 8. Dev quick start

```
python app.py      # 3 = install deps (first time), then 1 = run
```

Requirements (already on this PC): Node 18+, Rust (MSVC), VS Build Tools, WebView2, Python 3.
