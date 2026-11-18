//! Wallpaper library: built-in (bundled resources) + user (app data), and the `lw://` file server.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Clone)]
pub struct WallpaperInfo {
    /// "<source>/<folder>", e.g. "builtin/matrix-rain"
    pub id: String,
    pub source: String,
    pub title: String,
    pub description: String,
    pub accent: [String; 2],
    pub url: String,
}

#[derive(Deserialize, Serialize, Default)]
struct Meta {
    title: Option<String>,
    description: Option<String>,
    accent: Option<[String; 2]>,
}

const PALETTE: [&str; 6] = ["#6aa8ff", "#8b7bff", "#ff6b9a", "#ffb84d", "#3ddc97", "#4cc9f0"];

pub fn url_for(id: &str) -> String {
    format!("http://lw.localhost/{id}/index.html")
}

fn root_for(app: &AppHandle, source: &str) -> Result<PathBuf, String> {
    match source {
        "builtin" => app
            .path()
            .resource_dir()
            .map(|d| d.join("wallpapers"))
            .map_err(|e| e.to_string()),
        "user" => {
            let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("wallpapers");
            fs::create_dir_all(&d).map_err(|e| e.to_string())?;
            Ok(d)
        }
        _ => Err(format!("Unknown wallpaper source '{source}'")),
    }
}

fn safe_segment(s: &str) -> bool {
    !s.is_empty() && s != "." && s != ".." && !s.contains(['/', '\\', ':'])
}

fn info_for(dir: &Path, source: &str, folder: &str) -> WallpaperInfo {
    let meta: Meta = fs::read_to_string(dir.join("wallpaper.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let h = folder.bytes().fold(0usize, |a, b| a.wrapping_mul(31).wrapping_add(b as usize));
    let id = format!("{source}/{folder}");
    WallpaperInfo {
        title: meta.title.unwrap_or_else(|| folder.replace(['-', '_'], " ")),
        description: meta.description.unwrap_or_default(),
        accent: meta.accent.unwrap_or_else(|| {
            [PALETTE[h % 6].to_string(), PALETTE[(h / 6 + 1) % 6].to_string()]
        }),
        url: url_for(&id),
        source: source.to_string(),
        id,
    }
}

fn scan(app: &AppHandle, source: &str) -> Vec<WallpaperInfo> {
    let Ok(root) = root_for(app, source) else { return vec![] };
    let Ok(entries) = fs::read_dir(&root) else { return vec![] };
    let mut out: Vec<_> = entries
        .flatten()
        .filter(|e| e.path().join("index.html").is_file())
        .map(|e| info_for(&e.path(), source, &e.file_name().to_string_lossy()))
        .collect();
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    out
}

pub fn list(app: &AppHandle) -> Vec<WallpaperInfo> {
    let mut all = scan(app, "builtin");
    all.extend(scan(app, "user"));
    all
}

/// Validates an id and returns its folder.
pub fn resolve(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let (source, folder) = id.split_once('/').ok_or("Bad wallpaper id")?;
    if !safe_segment(folder) {
        return Err("Bad wallpaper id".into());
    }
    let dir = root_for(app, source)?.join(folder);
    if dir.join("index.html").is_file() {
        Ok(dir)
    } else {
        Err(format!("Wallpaper '{id}' not found"))
    }
}

fn slug(s: &str) -> String {
    let s: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "wallpaper".into() } else { s }
}

fn unique_dir(root: &Path, base: &str) -> PathBuf {
    let mut p = root.join(base);
    let mut n = 2;
    while p.exists() {
        p = root.join(format!("{base}-{n}"));
        n += 1;
    }
    p
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)?.flatten() {
        let target = to.join(e.file_name());
        if e.file_type()?.is_dir() {
            copy_dir(&e.path(), &target)?;
        } else {
            fs::copy(e.path(), target)?;
        }
    }
    Ok(())
}

pub fn import(app: &AppHandle, path: &str) -> Result<WallpaperInfo, String> {
    let src = PathBuf::from(path);
    let root = root_for(app, "user")?;
    let name = src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let dest = unique_dir(&root, &slug(&name));
    let err = |e: std::io::Error| e.to_string();

    if src.is_file() {
        let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if ext != "html" && ext != "htm" {
            return Err("Choose an .html file".into());
        }
        fs::create_dir_all(&dest).map_err(err)?;
        fs::copy(&src, dest.join("index.html")).map_err(err)?;
    } else if src.join("index.html").is_file() {
        copy_dir(&src, &dest).map_err(err)?;
    } else {
        return Err("That folder has no index.html".into());
    }

    if !dest.join("wallpaper.json").exists() {
        let meta = Meta { title: Some(name), description: Some("Added by you".into()), accent: None };
        let _ = fs::write(dest.join("wallpaper.json"), serde_json::to_string_pretty(&meta).unwrap());
    }
    let folder = dest.file_name().unwrap().to_string_lossy().to_string();
    Ok(info_for(&dest, "user", &folder))
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), String> {
    if !id.starts_with("user/") {
        return Err("Built-in wallpapers can't be removed".into());
    }
    let dir = resolve(app, id)?;
    fs::remove_dir_all(dir).map_err(|e| e.to_string())
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wasm" => "application/wasm",
        "woff2" => "font/woff2",
        "glsl" | "frag" | "vert" | "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

/// Serves `/<source>/<folder>/<file...>` from disk for the `lw://` protocol.
pub fn serve(app: &AppHandle, url_path: &str) -> Option<(Vec<u8>, &'static str)> {
    let decoded = percent_decode(url_path);
    let parts: Vec<&str> = decoded.trim_start_matches('/').split('/').collect();
    if parts.len() < 3 || !parts.iter().all(|p| safe_segment(p)) {
        return None;
    }
    let mut path = root_for(app, parts[0]).ok()?;
    for p in &parts[1..] {
        path.push(p);
    }
    let bytes = fs::read(&path).ok()?;
    Some((bytes, mime(&path)))
}
