const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

const $ = (s) => document.querySelector(s);
const state = { items: [], filter: "all", query: "", active: null };

const TITLES = {
  all: ["All wallpapers", "Everything on this PC: built-in, or added by you. Click a wallpaper to set it."],
  builtin: ["Gallery", "Official wallpapers that ship with the app."],
  user: ["My Wallpapers", "Wallpapers you added from an HTML file or folder."],
};

const ICON_TRASH =
  '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3200);
}

async function load() {
  try {
    const [items, active] = await Promise.all([invoke("list_wallpapers"), invoke("get_active")]);
    state.items = items;
    state.active = active;
    render();
  } catch (e) {
    toast(String(e), true);
  }
}

function visible() {
  const q = state.query.trim().toLowerCase();
  return state.items.filter(
    (w) =>
      (state.filter === "all" || w.source === state.filter) &&
      (!q || w.title.toLowerCase().includes(q) || w.description.toLowerCase().includes(q))
  );
}

function render() {
  for (const key of ["all", "builtin", "user"]) {
    $("#count-" + key).textContent =
      key === "all" ? state.items.length : state.items.filter((w) => w.source === key).length;
  }
  const [title, sub] = TITLES[state.filter];
  $("#page-title").textContent = title;
  $("#page-sub").textContent = sub;

  const activeItem = state.items.find((w) => w.id === state.active);
  $("#np-title").textContent = activeItem ? activeItem.title : "Nothing";
  $("#stop-btn").disabled = !state.active;

  const grid = $("#grid");
  grid.replaceChildren();
  const list = visible();
  $("#empty").hidden = list.length > 0;

  for (const w of list) {
    const card = document.createElement("article");
    card.className = "card" + (w.id === state.active ? " active" : "");
    card.title = w.description || w.title;

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const art = document.createElement("div");
    art.className = "art";
    const [a, b] = w.accent;
    art.style.background = `radial-gradient(circle at 30% 25%, ${a}cc, transparent 60%), radial-gradient(circle at 75% 80%, ${b}cc, transparent 55%), #0d0f12`;
    thumb.append(art);
    thumb.insertAdjacentHTML("beforeend", '<span class="badge">WEB</span>');
    if (w.id === state.active) thumb.insertAdjacentHTML("beforeend", '<span class="badge live">ACTIVE</span>');

    if (w.source === "user") {
      const del = document.createElement("button");
      del.className = "del";
      del.title = "Remove from library";
      del.innerHTML = ICON_TRASH;
      del.onclick = (e) => {
        e.stopPropagation();
        remove(w);
      };
      thumb.append(del);
    }

    // Live preview only while hovering, so idle library pages cost nothing.
    let hoverTimer;
    card.onmouseenter = () => {
      hoverTimer = setTimeout(() => {
        if (thumb.querySelector("iframe")) return;
        const f = document.createElement("iframe");
        f.src = w.url;
        f.tabIndex = -1;
        thumb.insertBefore(f, art.nextSibling);
      }, 350);
    };
    card.onmouseleave = () => {
      clearTimeout(hoverTimer);
      thumb.querySelector("iframe")?.remove();
    };
    card.onclick = () => apply(w);

    const h = document.createElement("h3");
    h.textContent = w.title;
    const p = document.createElement("p");
    p.textContent = w.description;
    card.append(thumb, h, p);
    grid.append(card);
  }
}

async function apply(w) {
  try {
    await invoke("set_wallpaper", { id: w.id });
    state.active = w.id;
    render();
    toast(`"${w.title}" is now your wallpaper`);
  } catch (e) {
    toast(String(e), true);
  }
}

async function remove(w) {
  if (!confirm(`Remove "${w.title}" from your library? Its files will be deleted.`)) return;
  try {
    await invoke("delete_wallpaper", { id: w.id });
    await load();
  } catch (e) {
    toast(String(e), true);
  }
}

async function addWallpaper(kind) {
  const path = await open(
    kind === "folder"
      ? { directory: true, title: "Choose a folder with index.html" }
      : { filters: [{ name: "Web page", extensions: ["html", "htm"] }], title: "Choose an HTML wallpaper" }
  );
  if (!path) return;
  try {
    const w = await invoke("import_wallpaper", { path });
    await load();
    toast(`Added "${w.title}"`);
  } catch (e) {
    toast(String(e), true);
  }
}

// Events
$("#nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b === btn));
  state.filter = btn.dataset.filter;
  render();
});
$("#search").addEventListener("input", (e) => {
  state.query = e.target.value;
  render();
});
$("#stop-btn").addEventListener("click", async () => {
  await invoke("stop_wallpaper");
  state.active = null;
  render();
});
$("#add-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("#add-menu").hidden = !$("#add-menu").hidden;
});
$("#add-menu").addEventListener("click", (e) => {
  const kind = e.target.dataset.kind;
  $("#add-menu").hidden = true;
  if (kind) addWallpaper(kind);
});
document.addEventListener("click", () => ($("#add-menu").hidden = true));
document.addEventListener("contextmenu", (e) => e.preventDefault());

// The tray "Stop wallpaper" item changes state behind our back.
window.__TAURI__.event.listen("active-changed", (e) => {
  state.active = e.payload;
  render();
});

load();
