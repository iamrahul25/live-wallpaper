"""Live Wallpaper - developer launcher.

Run:  python app.py
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TAURI = ROOT / "src-tauri"
BUNDLE = TAURI / "target" / "release" / "bundle"
IS_WIN = os.name == "nt"


def run(cmd: str, cwd: Path = ROOT) -> int:
    print(f"\n> {cmd}\n")
    try:
        return subprocess.call(cmd, cwd=cwd, shell=True)
    except KeyboardInterrupt:
        print("\nStopped.")
        return 130


def has(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def ensure_deps() -> bool:
    if (ROOT / "node_modules" / "@tauri-apps" / "cli").exists():
        return True
    print("Dependencies are missing, installing them first...")
    return run("npm install") == 0


def run_dev():
    if ensure_deps():
        print("Starting the app in dev mode (first run compiles Rust and takes a few minutes).")
        print("Close the window to hide it to the tray, then use the tray icon > Quit, or Ctrl+C here.")
        run("npm run tauri dev")


def build_release():
    if not ensure_deps():
        return
    if run("npm run tauri build") == 0:
        print("\nInstallers:")
        for f in sorted(BUNDLE.rglob("*")):
            if f.suffix.lower() in (".msi", ".exe"):
                print(f"  {f.relative_to(ROOT)}  ({f.stat().st_size / 1_048_576:.1f} MB)")
        exe = TAURI / "target" / "release" / "live-wallpaper.exe"
        if exe.exists():
            print(f"  app exe: {exe.stat().st_size / 1_048_576:.1f} MB")


def install_deps():
    run("npm install")


def check_env():
    def version(cmd):
        try:
            out = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=20)
            return (out.stdout or out.stderr).strip().splitlines()[0]
        except Exception:
            return "not found"

    print()
    for name, cmd in [("Node", "node -v"), ("npm", "npm -v"), ("Rust", "rustc -V"), ("Cargo", "cargo -V")]:
        print(f"  {name:<8} {version(cmd) if has(cmd.split()[0]) else 'NOT FOUND'}")
    if IS_WIN:
        wv = Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft" / "EdgeWebView" / "Application"
        print(f"  {'WebView2':<8} {'installed' if wv.exists() else 'NOT FOUND'}")
    print(f"  {'Python':<8} {sys.version.split()[0]}")


def open_user_wallpapers():
    folder = Path(os.environ.get("APPDATA", "")) / "com.livewallpaper.app" / "wallpapers"
    folder.mkdir(parents=True, exist_ok=True)
    print(f"User wallpapers: {folder}")
    if IS_WIN:
        os.startfile(folder)


def clean():
    if input("Delete src-tauri/target (full rebuild next time)? [y/N] ").strip().lower() == "y":
        run("cargo clean", cwd=TAURI)


MENU = [
    ("1", "Run the project (dev mode)", run_dev),
    ("2", "Build release installers (MSI + EXE)", build_release),
    ("3", "Install / update dependencies", install_deps),
    ("4", "Check environment", check_env),
    ("5", "Regenerate icons from app-icon.svg", lambda: run("npx tauri icon app-icon.svg")),
    ("6", "Open my imported wallpapers folder", open_user_wallpapers),
    ("7", "Clean Rust build cache", clean),
    ("0", "Exit", None),
]


def main():
    while True:
        print("\n=== Live Wallpaper ===")
        for key, label, _ in MENU:
            print(f"  {key}. {label}")
        try:
            choice = input("Choose an option: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if choice == "0":
            print("Bye!")
            break
        action = next((fn for key, _, fn in MENU if key == choice), None)
        if action:
            action()
        else:
            print("Unknown option.")


if __name__ == "__main__":
    main()
