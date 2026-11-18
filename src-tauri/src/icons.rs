//! Reads the position of every desktop icon so wallpapers can react to them.
//!
//! Explorer draws the icons in a `SysListView32` inside `SHELLDLL_DefView`. A list view's item
//! rectangle is returned through a pointer, so for another process the buffer has to live in
//! Explorer's address space: allocate 16 bytes there, send `LVM_GETITEMRECT`, read them back.

use std::ffi::c_void;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::System::Diagnostics::Debug::{ReadProcessMemory, WriteProcessMemory};
use windows::Win32::System::Memory::{VirtualAllocEx, VirtualFreeEx, MEM_COMMIT, MEM_RELEASE, MEM_RESERVE, PAGE_READWRITE};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_VM_OPERATION, PROCESS_VM_READ, PROCESS_VM_WRITE};
use windows::Win32::UI::WindowsAndMessaging::*;

const LVM_GETITEMCOUNT: u32 = 0x1004;
const LVM_GETITEMRECT: u32 = 0x100E;
const LVIR_BOUNDS: i32 = 0; // icon + label
const MAX_ICONS: i32 = 1500;

unsafe extern "system" fn find_defview(top: HWND, lparam: LPARAM) -> BOOL {
    if let Ok(d) = FindWindowExW(top, HWND::default(), w!("SHELLDLL_DefView"), PCWSTR::null()) {
        *(lparam.0 as *mut HWND) = d;
        return BOOL(0); // stop
    }
    BOOL(1)
}

unsafe fn find_listview() -> Option<HWND> {
    let progman = FindWindowW(w!("Progman"), PCWSTR::null()).ok()?;
    // Win11 24H2+: DefView is a child of Progman. Older layouts: it lives in a top-level WorkerW.
    let defview = match FindWindowExW(progman, HWND::default(), w!("SHELLDLL_DefView"), PCWSTR::null()) {
        Ok(d) => d,
        Err(_) => {
            let mut found = HWND::default();
            let _ = EnumWindows(Some(find_defview), LPARAM(&mut found as *mut HWND as isize));
            if found.is_invalid() {
                return None;
            }
            found
        }
    };
    FindWindowExW(defview, HWND::default(), w!("SysListView32"), PCWSTR::null()).ok()
}

/// `{"vis":bool,"sw":int,"sh":int,"r":[[x,y,w,h],...]}`, in physical pixels relative to the
/// primary monitor's top-left corner. `vis` is false while "Show desktop icons" is off.
pub fn snapshot_json() -> String {
    unsafe {
        let sw = GetSystemMetrics(SM_CXSCREEN);
        let sh = GetSystemMetrics(SM_CYSCREEN);
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);

        let (visible, rects) = read(vx, vy).unwrap_or((true, Vec::new()));
        let list: Vec<String> = rects.iter().map(|r| format!("[{},{},{},{}]", r.0, r.1, r.2, r.3)).collect();
        format!("{{\"vis\":{visible},\"sw\":{sw},\"sh\":{sh},\"r\":[{}]}}", list.join(","))
    }
}

unsafe fn read(vx: i32, vy: i32) -> Option<(bool, Vec<(i32, i32, i32, i32)>)> {
    let lv = find_listview()?;
    if !IsWindowVisible(lv).as_bool() {
        return Some((false, Vec::new()));
    }

    let mut pid = 0u32;
    GetWindowThreadProcessId(lv, Some(&mut pid));
    let proc = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, false, pid).ok()?;
    let mem = VirtualAllocEx(proc, None, 16, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    let mut out = Vec::new();

    if !mem.is_null() {
        let mut count: usize = 0;
        SendMessageTimeoutW(lv, LVM_GETITEMCOUNT, WPARAM(0), LPARAM(0), SMTO_ABORTIFHUNG, 250, Some(&mut count));
        for i in 0..(count as i32).clamp(0, MAX_ICONS) {
            let req = RECT { left: LVIR_BOUNDS, top: 0, right: 0, bottom: 0 };
            if WriteProcessMemory(proc, mem, &req as *const RECT as *const c_void, 16, None).is_err() {
                break;
            }
            let mut ok: usize = 0;
            SendMessageTimeoutW(lv, LVM_GETITEMRECT, WPARAM(i as usize), LPARAM(mem as isize), SMTO_ABORTIFHUNG, 250, Some(&mut ok));
            if ok == 0 {
                continue;
            }
            let mut r = RECT::default();
            if ReadProcessMemory(proc, mem, &mut r as *mut RECT as *mut c_void, 16, None).is_err() {
                break;
            }
            let (w, h) = (r.right - r.left, r.bottom - r.top);
            if w > 0 && h > 0 {
                // list-view client coords start at the virtual-screen origin; shift to the primary monitor
                out.push((r.left + vx, r.top + vy, w, h));
            }
        }
        let _ = VirtualFreeEx(proc, mem, 0, MEM_RELEASE);
    }
    let _ = CloseHandle(proc);
    Some((true, out))
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_desktop_icons() {
        let j = super::snapshot_json();
        println!("{j}");
        assert!(j.starts_with("{\"vis\":") && j.ends_with("]}"));
    }
}
