//! Forwards clicks on the bare desktop to the wallpaper page.
//!
//! The wallpaper window sits *behind* Explorer's full-screen icon layer, so Windows never sends it
//! mouse input. While a click-aware wallpaper is active we install a low-level mouse hook that only
//! looks at left-button presses. It never swallows them (Explorer still sees the click as usual),
//! and the hook is removed again as soon as the wallpaper stops or is switched.
//!
//! The hook callback stays tiny: it checks that the window under the cursor belongs to the desktop
//! and hands the point to a worker thread, which rejects clicks that land on an icon and calls
//! `window.__lwClick(x, y)` in the page (x, y in 0..1 of the primary monitor).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::*;

use crate::{AppState, WALLPAPER_LABEL};

static ENABLED: AtomicBool = AtomicBool::new(false);
static TX: OnceLock<Sender<(i32, i32)>> = OnceLock::new();
/// Thread id of the hook thread while a hook is installed.
static HOOK_THREAD: Mutex<Option<u32>> = Mutex::new(None);

/// Spawns the worker that turns raw clicks into page calls. Call once at startup.
pub fn init(app: AppHandle) {
    let (tx, rx) = channel();
    if TX.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || worker(app, rx));
}

/// Installs (or removes) the mouse hook. Cheap to call repeatedly with the same value.
pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
    let mut slot = HOOK_THREAD.lock().unwrap();
    if on && slot.is_none() {
        let (ready_tx, ready_rx) = channel::<u32>();
        std::thread::spawn(move || hook_thread(ready_tx));
        // Wait for the thread to have a message queue so a quick `set_enabled(false)` can reach it.
        if let Ok(tid) = ready_rx.recv_timeout(std::time::Duration::from_secs(2)) {
            *slot = Some(tid);
        }
    } else if !on {
        if let Some(tid) = slot.take() {
            unsafe {
                let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
    }
}

fn hook_thread(ready: Sender<u32>) {
    unsafe {
        // Touching the queue creates it; only then is the thread id a valid PostThreadMessage target.
        let mut msg = MSG::default();
        let _ = PeekMessageW(&mut msg, HWND::default(), WM_USER, WM_USER, PM_NOREMOVE);
        let hook = match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0) {
            Ok(h) => h,
            Err(_) => {
                let _ = ready.send(0);
                return;
            }
        };
        let _ = ready.send(GetCurrentThreadId());
        while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        let _ = UnhookWindowsHookEx(hook);
    }
}

fn class_of(hwnd: HWND) -> String {
    let mut buf = [0u16; 64];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
    String::from_utf16_lossy(&buf[..n.min(buf.len())])
}

/// True when `pt` is over the desktop itself (icon layer or our wallpaper), not over another window.
fn over_desktop(pt: POINT) -> bool {
    unsafe {
        let hwnd = WindowFromPoint(pt);
        if hwnd.is_invalid() {
            return false;
        }
        let root = GetAncestor(hwnd, GA_ROOT);
        let root = if root.is_invalid() { hwnd } else { root };
        matches!(class_of(root).as_str(), "Progman" | "WorkerW")
    }
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && wparam.0 as u32 == WM_LBUTTONDOWN && ENABLED.load(Ordering::Relaxed) {
        let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
        if over_desktop(info.pt) {
            if let Some(tx) = TX.get() {
                let _ = tx.send((info.pt.x, info.pt.y));
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// True when (x, y) falls inside one of the icon rectangles of the latest snapshot.
fn on_icon(json: &str, x: i32, y: i32) -> bool {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else { return false };
    let Some(rects) = v.get("r").and_then(|r| r.as_array()) else { return false };
    rects.iter().any(|r| {
        let n: Vec<i64> = r.as_array().map(|a| a.iter().filter_map(|v| v.as_i64()).collect()).unwrap_or_default();
        n.len() == 4 && (x as i64) >= n[0] && (x as i64) < n[0] + n[2] && (y as i64) >= n[1] && (y as i64) < n[1] + n[3]
    })
}

fn worker(app: AppHandle, rx: Receiver<(i32, i32)>) {
    while let Ok((x, y)) = rx.recv() {
        let (sw, sh) = unsafe { (GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)) };
        if x < 0 || y < 0 || x >= sw || y >= sh {
            continue; // another monitor: the wallpaper only covers the primary one
        }
        let st = app.state::<AppState>();
        // Icon positions are only kept fresh while the wallpaper asked for them.
        let json = if st.icons_on.load(Ordering::Relaxed) { st.icons_json.lock().unwrap().clone() } else { String::new() };
        if on_icon(&json, x, y) {
            continue; // the user is clicking an icon, not the water
        }
        if let Some(win) = app.get_webview_window(WALLPAPER_LABEL) {
            let _ = win.eval(format!(
                "window.__lwClick&&window.__lwClick({:.5},{:.5})",
                x as f64 / sw as f64,
                y as f64 / sh as f64
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::on_icon;

    #[test]
    fn icon_hit_test() {
        let j = r#"{"vis":true,"sw":1920,"sh":1080,"r":[[10,20,50,60],[200,200,40,40]]}"#;
        assert!(on_icon(j, 10, 20));
        assert!(on_icon(j, 59, 79));
        assert!(!on_icon(j, 60, 79));
        assert!(!on_icon(j, 100, 100));
        assert!(on_icon(j, 220, 220));
        assert!(!on_icon("{\"demo\":true}", 10, 20));
    }
}
