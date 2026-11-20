// Hide the console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
mod desktop;
#[cfg(windows)]
mod icons;
#[cfg(windows)]
mod input;
mod library;

use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::http::Response;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const WALLPAPER_LABEL: &str = "wallpaper";

#[derive(Default)]
struct AppState {
    active: Mutex<Option<String>>,
    /// The active wallpaper asked for desktop icon positions, so the poller is running.
    icons_on: AtomicBool,
    /// Latest icon snapshot; served to pages at `/__icons`. Empty until first read.
    icons_json: Mutex<String>,
}

fn icons_snapshot() -> String {
    #[cfg(windows)]
    {
        icons::snapshot_json()
    }
    #[cfg(not(windows))]
    {
        String::new()
    }
}

/// Polls Explorer for icon positions (only while an icon-aware wallpaper is active) and pushes
/// changes into the wallpaper page. Pages also pull the latest snapshot on load.
fn start_icon_poller(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = String::new();
        loop {
            std::thread::sleep(Duration::from_millis(250));
            let st = app.state::<AppState>();
            if !st.icons_on.load(Ordering::Relaxed) {
                last.clear();
                continue;
            }
            let json = icons_snapshot();
            if json == last {
                continue;
            }
            last = json.clone();
            *st.icons_json.lock().unwrap() = json.clone();
            if let Some(win) = app.get_webview_window(WALLPAPER_LABEL) {
                let _ = win.eval(format!("window.__lwIcons&&window.__lwIcons({json})"));
            }
        }
    });
}

#[derive(Serialize, Deserialize, Default)]
struct Settings {
    active: Option<String>,
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(app: &AppHandle, s: &Settings) {
    if let Some(p) = settings_path(app) {
        if let Some(dir) = p.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(p, serde_json::to_string_pretty(s).unwrap_or_default());
    }
}

fn set_active(app: &AppHandle, id: Option<String>) {
    *app.state::<AppState>().active.lock().unwrap() = id.clone();
    save_settings(app, &Settings { active: id.clone() });
    let _ = app.emit("active-changed", id);
}

/// Shows `id` on the desktop, creating and embedding the wallpaper window on first use.
fn show_wallpaper(app: &AppHandle, id: &str) -> Result<(), String> {
    library::resolve(app, id)?;
    let wants_icons = library::uses_icons(app, id);
    {
        let st = app.state::<AppState>();
        if wants_icons {
            // Fresh snapshot first, so the page's initial pull already has real positions.
            *st.icons_json.lock().unwrap() = icons_snapshot();
        }
        st.icons_on.store(wants_icons, Ordering::Relaxed);
    }
    #[cfg(windows)]
    input::set_enabled(library::uses_clicks(app, id));
    let url =library::url_for(id).parse::<tauri::Url>().map_err(|e| e.to_string())?;

    if let Some(win) = app.get_webview_window(WALLPAPER_LABEL) {
        win.navigate(url).map_err(|e| e.to_string())?;
    } else {
        let win = WebviewWindowBuilder::new(app, WALLPAPER_LABEL, WebviewUrl::External(url))
            .title("Live Wallpaper host")
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .focused(false)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            let hwnd = win.hwnd().map_err(|e| e.to_string())?;
            if let Err(e) = desktop::attach(hwnd.0 as *mut _) {
                let _ = win.destroy();
                return Err(e);
            }
        }
    }
    set_active(app, Some(id.to_string()));
    Ok(())
}

fn stop(app: &AppHandle) {
    app.state::<AppState>().icons_on.store(false, Ordering::Relaxed);
    #[cfg(windows)]
    input::set_enabled(false);
    if let Some(win) = app.get_webview_window(WALLPAPER_LABEL) {
        let _ = win.destroy();
        #[cfg(windows)]
        desktop::refresh_static_wallpaper();
    }
    set_active(app, None);
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ---- Commands (async so window creation never deadlocks on Windows) ----

#[tauri::command]
fn list_wallpapers(app: AppHandle) -> Vec<library::WallpaperInfo> {
    library::list(&app)
}

#[tauri::command]
fn get_active(state: State<'_, AppState>) -> Option<String> {
    state.active.lock().unwrap().clone()
}

#[tauri::command]
async fn set_wallpaper(app: AppHandle, id: String) -> Result<(), String> {
    show_wallpaper(&app, &id)
}

#[tauri::command]
async fn stop_wallpaper(app: AppHandle) {
    stop(&app);
}

#[tauri::command]
fn import_wallpaper(app: AppHandle, path: String) -> Result<library::WallpaperInfo, String> {
    library::import(&app, &path)
}

#[tauri::command]
async fn delete_wallpaper(app: AppHandle, id: String) -> Result<(), String> {
    let active = app.state::<AppState>().active.lock().unwrap().clone();
    if active.as_deref() == Some(id.as_str()) {
        stop(&app);
    }
    library::delete(&app, &id)
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .register_uri_scheme_protocol("lw", |ctx, request| {
            if request.uri().path() == "/__icons" {
                let json = ctx.app_handle().state::<AppState>().icons_json.lock().unwrap().clone();
                // `demo` tells the page nobody has read the desktop yet (e.g. a library preview).
                let body = if json.is_empty() { "{\"demo\":true}".to_string() } else { json };
                return Response::builder()
                    .header("Content-Type", "application/json")
                    .header("Cache-Control", "no-store")
                    .body(body.into_bytes())
                    .unwrap();
            }
            match library::serve(ctx.app_handle(), request.uri().path()) {
                Some((body, mime)) => Response::builder()
                    .header("Content-Type", mime)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(body)
                    .unwrap(),
                None => Response::builder().status(404).body(b"Not found".to_vec()).unwrap(),
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_wallpapers,
            get_active,
            set_wallpaper,
            stop_wallpaper,
            import_wallpaper,
            delete_wallpaper
        ])
        .setup(|app| {
            // Tray: the app keeps running (and the wallpaper keeps playing) when the window closes.
            let open = MenuItem::with_id(app, "open", "Open library", true, None::<&str>)?;
            let stop_item = MenuItem::with_id(app, "stop", "Stop wallpaper", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &stop_item, &sep, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Live Wallpaper")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "stop" => stop(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            start_icon_poller(app.handle().clone());
            #[cfg(windows)]
            input::init(app.handle().clone());

            // Restore the last wallpaper.
            if let Some(id) = load_settings(app.handle()).active {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if show_wallpaper(&handle, &id).is_err() {
                        set_active(&handle, None);
                    }
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the app");

    app.run(|_app, event| {
        if let RunEvent::Exit = event {
            #[cfg(windows)]
            desktop::refresh_static_wallpaper();
        }
    });
}
