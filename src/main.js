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
const ICON_SLIDERS =
  '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';

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
  $("#customize-btn").hidden = !activeItem?.customizable;
  if (drawer.item) updateDrawerNote();

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
    // Static screenshot by default. Falls back to a gradient when no thumb.png exists.
    const [a, b] = w.accent;
    const art = document.createElement("img");
    art.className = "art";
    art.alt = "";
    art.draggable = false;
    const base = w.url.replace(/index\.html$/, "thumb");
    const tries = [base + ".jpg", base + ".png"];
    art.onerror = () => {
      const next = tries.shift();
      if (next) { art.src = next; return; }
      art.removeAttribute("src");
      art.style.background = `radial-gradient(circle at 30% 25%, ${a}cc, transparent 60%), radial-gradient(circle at 75% 80%, ${b}cc, transparent 55%), #0d0f12`;
    };
    art.onerror();
    thumb.append(art);
    thumb.insertAdjacentHTML("beforeend", '<span class="badge">WEB</span>');
    if (w.id === state.active) thumb.insertAdjacentHTML("beforeend", '<span class="badge live">ACTIVE</span>');

    // Hover tools: customize (wallpapers with a LivelyProperties.json), delete (user wallpapers).
    const tools = document.createElement("div");
    tools.className = "tools";
    const tool = (cls, title, icon, fn) => {
      const b = document.createElement("button");
      b.className = "tool " + cls;
      b.title = title;
      b.innerHTML = icon;
      b.onclick = (e) => {
        e.stopPropagation();
        fn();
      };
      tools.append(b);
    };
    if (w.customizable) tool("cust", "Customize", ICON_SLIDERS, () => openCustomize(w));
    if (w.source === "user") tool("del", "Remove from library", ICON_TRASH, () => remove(w));
    if (tools.childElementCount) thumb.append(tools);

    // Live preview only while hovering, so idle library cards cost no CPU.
    let hoverTimer;
    card.onmouseenter = () => {
      hoverTimer = setTimeout(() => {
        if (thumb.querySelector("iframe")) return;
        const f = document.createElement("iframe");
        f.tabIndex = -1;
        f.title = w.title;
        f.onload = () => f.classList.add("live");
        f.src = w.url;
        thumb.insertBefore(f, thumb.querySelector(".badge"));
      }, 200);
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

/* ------------------------------------------------------------------------------------------
 * Customize drawer
 *
 * The controls come from the wallpaper's LivelyProperties.json (Lively's format):
 *   { "<name>": { "type": "slider" | "checkbox" | "dropdown" | "color" | "textbox" | "label",
 *                 "value": <default>, "text": "<label>", min/max/step (slider), items (dropdown) } }
 * Values: slider number, checkbox boolean, dropdown index of the item, color "#rrggbb", textbox string.
 *
 * A change goes two ways:
 *   - the preview iframe, at once, by postMessage (the bridge Rust injects into every wallpaper page
 *     forwards it to the page's livelyPropertyListener; see src-tauri/src/bridge.js)
 *   - invoke("set_property"): Rust saves it in settings.json and, if this wallpaper is on the desktop,
 *     applies it there too. Saved values are given to the page again every time it loads.
 * Sliders update the preview while dragging and save when released.
 * ---------------------------------------------------------------------------------------- */
const drawer = { item: null, schema: null };

async function openCustomize(w) {
  let info;
  try {
    info = await invoke("get_properties", { id: w.id });
  } catch (e) {
    toast(String(e), true);
    return;
  }
  if (!info) {
    toast(`"${w.title}" has no settings`, true);
    return;
  }
  let schema;
  try {
    schema = JSON.parse(info.schema);
  } catch (e) {
    toast(`LivelyProperties.json of "${w.title}" is not valid JSON`, true);
    return;
  }
  drawer.item = w;
  drawer.schema = schema;
  $("#dr-title").textContent = w.title;
  buildForm(schema, info.values || {});
  updateDrawerNote();

  // Live preview. It loads with the saved values (injected by Rust), then gets changes by postMessage.
  const box = $("#dr-preview");
  box.replaceChildren();
  const f = document.createElement("iframe");
  f.title = w.title + " preview";
  f.src = w.url;
  box.append(f);

  $("#scrim").hidden = false;
  $("#drawer").hidden = false;
  $("#dr-close").focus();
}

function closeCustomize() {
  if (!drawer.item) return;
  drawer.item = null;
  drawer.schema = null;
  $("#dr-preview").replaceChildren();   // stops the preview so it costs nothing while closed
  $("#dr-form").replaceChildren();
  $("#drawer").hidden = true;
  $("#scrim").hidden = true;
}

function updateDrawerNote() {
  const live = drawer.item && drawer.item.id === state.active;
  $("#dr-note").textContent = live
    ? "Changes apply to your desktop right away and are saved."
    : "Changes are saved and used whenever you set this wallpaper.";
  $("#dr-apply").hidden = live;
}

// Builds one control per property, in the order they are written in the file.
function buildForm(schema, values) {
  const form = $("#dr-form");
  form.replaceChildren();
  for (const [name, p] of Object.entries(schema)) {
    if (!p || typeof p !== "object") continue;
    const value = name in values ? values[name] : p.value;
    const row = control(name, p, value);
    if (row) form.append(row);
  }
}

function control(name, p, value) {
  const wrap = document.createElement("div");
  wrap.className = "prop";
  const head = document.createElement("div");
  head.className = "prop-row";
  const label = document.createElement("label");
  label.className = "prop-label";
  label.textContent = p.text || name;
  const id = "prop-" + name;
  label.htmlFor = id;
  head.append(label);
  wrap.append(head);

  switch (p.type) {
    case "slider": {
      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = p.min ?? 0;
      input.max = p.max ?? 100;
      input.step = p.step ?? 1;
      input.value = value;
      const out = document.createElement("output");
      out.className = "prop-value";
      const show = () => (out.textContent = formatNumber(+input.value, p.step));
      show();
      head.append(out);
      input.oninput = () => {
        show();
        preview(name, +input.value);
      };
      input.onchange = () => save(name, +input.value);
      wrap.append(input);
      break;
    }
    case "checkbox": {
      const sw = document.createElement("span");
      sw.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.checked = !!value;
      input.onchange = () => change(name, input.checked);
      sw.append(input, document.createElement("span"));
      head.append(sw);
      break;
    }
    case "dropdown": {
      const sel = document.createElement("select");
      sel.id = id;
      (p.items || []).forEach((text, i) => sel.add(new Option(text, String(i))));
      sel.selectedIndex = Math.max(0, Math.min((p.items || []).length - 1, +value || 0));
      sel.onchange = () => change(name, sel.selectedIndex);
      head.append(sel);
      break;
    }
    case "color": {
      const input = document.createElement("input");
      input.type = "color";
      input.id = id;
      input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
      input.oninput = () => preview(name, input.value);
      input.onchange = () => save(name, input.value);
      head.append(input);
      break;
    }
    case "textbox": {
      const input = document.createElement("input");
      input.type = "text";
      input.id = id;
      input.value = value ?? "";
      input.onchange = () => change(name, input.value);
      wrap.append(input);
      break;
    }
    case "label": {
      label.className = "prop-text";
      label.textContent = p.value ?? p.text ?? "";
      break;
    }
    default:
      return null;   // button, folderDropdown, ...: not supported yet
  }
  return wrap;
}

function formatNumber(v, step) {
  const s = String(step ?? 1);
  const decimals = s.includes(".") ? s.split(".")[1].length : 0;
  return v.toFixed(decimals);
}

// Sends a value to the preview iframe only.
function preview(name, value) {
  const f = $("#dr-preview iframe");
  f?.contentWindow?.postMessage({ type: "lw:property", name, value }, "*");
}

// Saves a value (Rust also applies it to the desktop wallpaper when this one is showing).
async function save(name, value) {
  if (!drawer.item) return;
  try {
    await invoke("set_property", { id: drawer.item.id, name, value });
  } catch (e) {
    toast(String(e), true);
  }
}

function change(name, value) {
  preview(name, value);
  save(name, value);
}

async function resetCustomize() {
  const w = drawer.item;
  if (!w) return;
  try {
    await invoke("reset_properties", { id: w.id });
  } catch (e) {
    toast(String(e), true);
    return;
  }
  buildForm(drawer.schema, {});
  for (const [name, p] of Object.entries(drawer.schema)) if (p && "value" in p) preview(name, p.value);
  toast("Settings reset to defaults");
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
$("#customize-btn").addEventListener("click", () => {
  const w = state.items.find((x) => x.id === state.active);
  if (w) openCustomize(w);
});
$("#dr-close").addEventListener("click", closeCustomize);
$("#scrim").addEventListener("click", closeCustomize);
$("#dr-reset").addEventListener("click", resetCustomize);
$("#dr-apply").addEventListener("click", () => drawer.item && apply(drawer.item));
$("#dr-form").addEventListener("submit", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCustomize();
});
document.addEventListener("contextmenu", (e) => e.preventDefault());

// The tray "Stop wallpaper" item changes state behind our back.
window.__TAURI__.event.listen("active-changed", (e) => {
  state.active = e.payload;
  render();
});

load();
