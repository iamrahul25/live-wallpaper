//! Puts a window behind the desktop icons (the classic Progman/WorkerW trick).
//!
//! Two shell layouts exist:
//! * Classic (Win10, Win11 before 24H2): after message 0x052C, Explorer creates a top-level
//!   `WorkerW` right behind the one that hosts `SHELLDLL_DefView` (the icons). We parent into it.
//! * Raised desktop (Win11 24H2+): `SHELLDLL_DefView` and a `WorkerW` are both *children* of
//!   `Progman`. We parent into `Progman` and slot the window just below the icons.

use std::ffi::c_void;
use std::sync::atomic::{AtomicIsize, Ordering};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{BOOL, COLORREF, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::*;

unsafe extern "system" fn find_worker(top: HWND, lparam: LPARAM) -> BOOL {
    if FindWindowExW(top, HWND::default(), w!("SHELLDLL_DefView"), PCWSTR::null()).is_ok() {
        if let Ok(worker) = FindWindowExW(HWND::default(), top, w!("WorkerW"), PCWSTR::null()) {
            *(lparam.0 as *mut HWND) = worker;
        }
    }
    BOOL(1)
}

/// The host window's original window procedure (tao's), which `full_client_proc` forwards to.
static ORIG_PROC: AtomicIsize = AtomicIsize::new(0);

/// tao answers WM_NCCALCSIZE for undecorated windows by keeping an invisible resize border
/// (about 9 px left/right/bottom and 1 px top at 125 % scaling). On the desktop that border is
/// never painted, so it showed as thin strips down both screen edges. Here the whole window is
/// client area.
unsafe extern "system" fn full_client_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    if msg == WM_NCCALCSIZE {
        return LRESULT(0); // leaves the proposed window rect as the client rect
    }
    let orig: WNDPROC = std::mem::transmute(ORIG_PROC.load(Ordering::Relaxed));
    CallWindowProcW(orig, hwnd, msg, wp, lp)
}

/// Primary-monitor rectangle relative to the virtual-screen origin (where Progman/WorkerW start).
fn primary_rect() -> (i32, i32, i32, i32) {
    unsafe {
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        (-vx, -vy, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN))
    }
}

pub fn attach(raw_hwnd: *mut c_void) -> Result<(), String> {
    let hwnd = HWND(raw_hwnd);
    unsafe {
        let progman = FindWindowW(w!("Progman"), PCWSTR::null())
            .map_err(|e| format!("Desktop (Progman) not found: {e}"))?;

        // Ask Explorer to create the wallpaper WorkerW.
        SendMessageTimeoutW(progman, 0x052C, WPARAM(0xD), LPARAM(0x1), SMTO_NORMAL, 1000, None);
        SendMessageTimeoutW(progman, 0x052C, WPARAM(0), LPARAM(0), SMTO_NORMAL, 1000, None);

        let (x, y, cx, cy) = primary_rect();
        // Make the whole window client area (see `full_client_proc`). Only subclass once per window.
        let ours = full_client_proc as unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT as usize as isize;
        let cur = GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
        if cur != ours {
            ORIG_PROC.store(cur, Ordering::Relaxed);
            SetWindowLongPtrW(hwnd, GWLP_WNDPROC, ours);
        }
        // Drop frame/border styles too, so nothing else reserves a non-client area.
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        let frame = (WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX).0 as isize;
        SetWindowLongPtrW(hwnd, GWL_STYLE, style & !frame);
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let ex_frame = (WS_EX_CLIENTEDGE | WS_EX_WINDOWEDGE | WS_EX_DLGMODALFRAME | WS_EX_STATICEDGE).0 as isize;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex & !ex_frame);
        let flags = SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED;

        let defview = FindWindowExW(progman, HWND::default(), w!("SHELLDLL_DefView"), PCWSTR::null());
        let child_worker = FindWindowExW(progman, HWND::default(), w!("WorkerW"), PCWSTR::null());

        if let (Ok(defview), Ok(_)) = (defview, child_worker) {
            // Raised-desktop layout (Win11 24H2+). Layered style is required here or
            // the window renders black/transparent under DefView.
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED.0 as isize);
            let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
            SetParent(hwnd, progman).map_err(|e| format!("SetParent failed: {e}"))?;
            SetWindowPos(hwnd, defview, x, y, cx, cy, flags).map_err(|e| e.to_string())?;
        } else {
            let mut worker = HWND::default();
            let _ = EnumWindows(Some(find_worker), LPARAM(&mut worker as *mut HWND as isize));
            if worker.is_invalid() {
                return Err("Could not find the desktop WorkerW window".into());
            }
            SetParent(hwnd, worker).map_err(|e| format!("SetParent failed: {e}"))?;
            SetWindowPos(hwnd, HWND::default(), x, y, cx, cy, flags | SWP_NOZORDER)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Re-apply the user's static wallpaper so no stale frame is left after we close our window.
pub fn refresh_static_wallpaper() {
    unsafe {
        let mut buf = [0u16; 260];
        let p = buf.as_mut_ptr() as *mut c_void;
        if SystemParametersInfoW(SPI_GETDESKWALLPAPER, buf.len() as u32, Some(p), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)).is_ok() {
            let _ = SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, Some(p), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
        }
    }
}
