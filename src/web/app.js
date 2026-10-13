// Map the Day! web app — circular day planner with colorful event arcs.
import { minutesToAngle, polarPoint, hourTicks, nowMinutes, minutesToTime, timeToMinutes } from "/core/clock.js";
import { pickColor } from "/core/themes.js";

const state = {
  settings: { theme: "paper", clockMode: "h12", showStickers: true, timezone: null },
  themes: {},
  events: [],
  view: "day",
  year: new Date().getFullYear(),
  selectedId: null,
  draftColorIndex: 0,
  draftChecklist: [],
  draftStickers: [],
  nowMin: nowMinutes(),
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

function theme() {
  return state.themes[state.settings.theme] || state.themes.paper || {
    face: "#faf8f5", ink: "#2b2620", tick: "#3a342c", tickMuted: "#b8b0a4",
    handNow: "#e85d04", grid: "rgba(43,38,32,0.06)", faceRing: "#e8e4dc",
    palette: ["#e85d04"], shadow: "rgba(0,0,0,0.1)",
  };
}

function evColor(ev, i) {
  if (ev.color) return ev.color;
  const idx = ev.colorIndex ?? i ?? 0;
  return pickColor(theme(), idx);
}

function applyThemeCSS() {
  const t = theme();
  const r = document.documentElement.style;
  r.setProperty("--face", t.face);
  r.setProperty("--face-ring", t.faceRing);
  r.setProperty("--ink", t.ink);
  r.setProperty("--tick", t.tick);
  r.setProperty("--tick-muted", t.tickMuted);
  r.setProperty("--hand-now", t.handNow);
  r.setProperty("--grid", t.grid);
  r.setProperty("--shadow", t.shadow);
  r.setProperty("--panel", t.face);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t.face;
}

/* ---------- DATA ---------- */
async function refresh() {
  const [settings, events, themes] = await Promise.all([
    api("/settings"),
    api("/events"),
    api("/themes"),
  ]);
  state.settings = settings;
  state.events = events;
  state.themes = Object.fromEntries(themes.map((t) => [t.id, t]));
  applyThemeCSS();
  render();
}

/* ---------- RENDER: DAY CLOCK ---------- */
function renderClock() {
  const svg = $("#clock");
  const t = theme();
  const mode = state.settings.clockMode;
  const R = 100;
  const arcR = 78;
  const arcW = 22;
  const now = state.nowMin;

  let s = "";
  // dial
  s += `<circle r="${R}" fill="${t.face}" stroke="${t.faceRing}" stroke-width="1.5" />`;
  s += `<circle r="${arcR + arcW / 2 + 6}" fill="none" stroke="${t.grid}" stroke-width="0.5" />`;

  // ticks + labels
  for (const tk of hourTicks({ mode, outer: R - 6, inner: R - 16, labelR: R - 28 })) {
    if (tk.kind === "tick") {
      s += `<line class="tick-line" x1="${tk.x1}" y1="${tk.y1}" x2="${tk.x2}" y2="${tk.y2}" stroke="${tk.major ? t.tick : t.tickMuted}" stroke-width="${tk.major ? 2 : 1}" />`;
    } else {
      s += `<text class="hour-label" x="${tk.x}" y="${tk.y}" fill="${t.tickMuted}">${tk.text}</text>`;
    }
  }

  // events as arcs
  state.events.forEach((ev, i) => {
    const color = evColor(ev, i);
    const a0 = minutesToAngle(ev.startMin, mode);
    let a1 = minutesToAngle(ev.endMin, mode);
    if (a1 <= a0) a1 += 360;
    const large = a1 - a0 > 180 ? 1 : 0;
    const rad = (deg) => ((deg - 90) * Math.PI) / 180;
    const x0 = arcR * Math.cos(rad(a0));
    const y0 = arcR * Math.sin(rad(a0));
    const x1 = arcR * Math.cos(rad(a1));
    const y1 = arcR * Math.sin(rad(a1));
    const path = `M ${x0} ${y0} A ${arcR} ${arcR} 0 ${large} 1 ${x1} ${y1}`;
    const isNow = isEventNow(ev, now);
    s += `<path class="arc" data-id="${ev.id}" d="${path}" fill="none" stroke="${color}" stroke-width="${arcW}" stroke-linecap="round" opacity="${isNow ? 1 : 0.92}" ${isNow ? `filter="url(#glow)"` : ""} />`;
    // wider invisible hit target
    s += `<path class="arc-hit" data-id="${ev.id}" d="${path}" fill="none" stroke="transparent" stroke-width="${arcW + 12}" stroke-linecap="round" />`;

    // label along arc mid
    const mid = (a0 + a1) / 2;
    const lp = polarPoint(mid, arcR, 0, 0);
    const short = ev.title.length > 10 ? ev.title.slice(0, 9) + "…" : ev.title;
    s += `<text class="sticker-text" x="${lp.x}" y="${lp.y}" fill="#fff" font-size="8" font-weight="500" opacity="0.95" style="paint-order:stroke;stroke:rgba(0,0,0,0.25);stroke-width:1.5">${escapeXml(short)}</text>`;

    // stickers outside
    if (state.settings.showStickers && ev.stickers?.length) {
      for (const st of ev.stickers) {
        const sp = polarPoint(st.angle, R + 6 + (st.radius - 1) * 40, 0, 0);
        s += `<text class="sticker-text" x="${sp.x}" y="${sp.y}" font-size="12">${escapeXml(st.emoji)}</text>`;
      }
    }
  });

  // now hand
  const nowAngle = minutesToAngle(now, mode);
  const tip = polarPoint(nowAngle, arcR + 8, 0, 0);
  const tail = polarPoint(nowAngle, -18, 0, 0);
  s += `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter></defs>`;
  s += `<line x1="${tail.x}" y1="${tail.y}" x2="${tip.x}" y2="${tip.y}" stroke="${t.handNow}" stroke-width="2.2" stroke-linecap="round" />`;
  s += `<circle cx="${tip.x}" cy="${tip.y}" r="4" fill="${t.handNow}" />`;
  s += `<circle r="3" fill="${t.ink}" />`;

  // center time text
  s += `<text x="0" y="-8" text-anchor="middle" fill="${t.ink}" font-size="11" font-weight="500" opacity="0.55">${minutesToTime(now)}</text>`;

  svg.innerHTML = s;
  svg.querySelectorAll(".arc, .arc-hit").forEach((el) => {
    el.addEventListener("click", () => openEditor(el.dataset.id));
  });

  const chip = $("#now-chip");
  const current = state.events.filter((ev) => isEventNow(ev, now));
  if (current.length) {
    chip.textContent = `● ${current.map((e) => e.title).join(" · ")}`;
    chip.classList.remove("hidden");
  } else {
    chip.classList.add("hidden");
  }
}

function isEventNow(ev, now) {
  if (ev.overnight) return now >= ev.startMin || now < ev.endMin;
  return now >= ev.startMin && now < ev.endMin;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function renderDayList() {
  const box = $("#day-list");
  const now = state.nowMin;
  if (!state.events.length) {
    box.innerHTML = `<div class="empty-hint">No events yet.<br/>Tap <b>+</b> to draw your first arc.</div>`;
    return;
  }
  box.innerHTML = state.events.map((ev, i) => {
    const color = evColor(ev, i);
    const done = (ev.checklist || []).filter((c) => c.done).length;
    const total = (ev.checklist || []).length;
    return `<article class="ev-card ${isEventNow(ev, now) ? "now" : ""}" data-id="${ev.id}" style="--dot:${color}">
      <div class="t">${escapeXml(ev.title)}</div>
      <div class="time">${ev.startLabel} – ${ev.endLabel}${ev.overnight ? " +" : ""}</div>
      ${total ? `<div class="meta">✓ ${done}/${total} checklist</div>` : ""}
      ${(ev.stickers || []).length ? `<div class="meta">${ev.stickers.map((s) => s.emoji).join(" ")}</div>` : ""}
    </article>`;
  }).join("");
  box.querySelectorAll(".ev-card").forEach((el) => {
    el.addEventListener("click", () => openEditor(el.dataset.id));
  });
}

/* ---------- RENDER: WEEK ---------- */
function weekStart(d) {
  const x = new Date(d);
  const ws = state.settings.weekStart ?? 1;
  const diff = (x.getDay() - ws + 7) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function renderWeek() {
  const grid = $("#week-grid");
  const start = weekStart(new Date());
  const mode = state.settings.clockMode;
  const t = theme();
  let s = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayEvents = state.events; // day-agnostic planner shows all; filter if day set
    const isToday = iso === new Date().toISOString().slice(0, 10);
    s += `<div class="week-day ${isToday ? "today" : ""}" data-day="${iso}">
      <h3>${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</h3>
      <svg class="mini-clock" viewBox="-55 -55 110 110">${miniClock(mode, t, isToday ? state.nowMin : null)}</svg>
      ${dayEvents.map((ev, idx) => `<button class="week-ev" data-id="${ev.id}" style="--dot:${evColor(ev, idx)}; background:${evColor(ev, idx)}">${escapeXml(ev.title)}</button>`).join("")}
    </div>`;
  }
  grid.innerHTML = s;
  grid.querySelectorAll(".week-ev").forEach((el) => {
    el.addEventListener("click", () => openEditor(el.dataset.id));
  });
  grid.querySelectorAll(".week-day").forEach((el) => {
    el.addEventListener("dblclick", () => openEditor(null, el.dataset.day));
  });
}

function miniClock(mode, t, now) {
  let s = `<circle r="48" fill="${t.face}" stroke="${t.faceRing}" stroke-width="1" />`;
  state.events.forEach((ev, i) => {
    const color = evColor(ev, i);
    const a0 = minutesToAngle(ev.startMin, mode);
    let a1 = minutesToAngle(ev.endMin, mode);
    if (a1 <= a0) a1 += 360;
    const large = a1 - a0 > 180 ? 1 : 0;
    const rad = (deg) => ((deg - 90) * Math.PI) / 180;
    const R = 36;
    const x0 = R * Math.cos(rad(a0)), y0 = R * Math.sin(rad(a0));
    const x1 = R * Math.cos(rad(a1)), y1 = R * Math.sin(rad(a1));
    s += `<path d="M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" opacity="0.9" />`;
  });
  if (now != null) {
    const a = minutesToAngle(now, mode);
    const tip = polarPoint(a, 40, 0, 0);
    s += `<line x1="0" y1="0" x2="${tip.x}" y2="${tip.y}" stroke="${t.handNow}" stroke-width="1.5" stroke-linecap="round" />`;
    s += `<circle r="2" fill="${t.ink}" />`;
  }
  return s;
}

/* ---------- RENDER: YEAR ---------- */
function renderYear() {
  $("#year-label").textContent = state.year;
  const grid = $("#year-grid");
  const t = theme();
  const todayIso = new Date().toISOString().slice(0, 10);
  let s = "";
  for (let m = 0; m < 12; m++) {
    const first = new Date(state.year, m, 1);
    const daysIn = new Date(state.year, m + 1, 0).getDate();
    const ws = state.settings.weekStart ?? 1;
    const offset = (first.getDay() - ws + 7) % 7;
    s += `<div class="month-card" style="--dot:${pickColor(t, m)}">
      <h4>${first.toLocaleDateString(undefined, { month: "long" })}</h4>
      <div class="month-days">
        ${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span class="hd">${d}</span>`).join("")}
        ${Array.from({ length: offset }, () => "<span></span>").join("")}`;
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${state.year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const has = state.events.some((e) => e.day === iso) || (state.events.length && !state.events.some((e) => e.day));
      // show density dot only for explicit day events; if no day set, mark today only lightly
      const explicit = state.events.some((e) => e.day === iso);
      const cls = [iso === todayIso ? "today" : "", explicit ? "has" : ""].filter(Boolean).join(" ");
      s += `<button class="${cls}" data-day="${iso}" title="${iso}">${d}</button>`;
    }
    s += `</div></div>`;
  }
  grid.innerHTML = s;
  grid.querySelectorAll("button[data-day]").forEach((el) => {
    el.addEventListener("click", () => {
      setView("day");
      openEditor(null, el.dataset.day);
    });
  });
}

function render() {
  renderClock();
  renderDayList();
  if (state.view === "week") renderWeek();
  if (state.view === "year") renderYear();
}

function setView(v) {
  state.view = v;
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $$(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${v}`));
  render();
}

/* ---------- EDITOR ---------- */
function openEditor(id = null, day = null) {
  const panel = $("#detail-panel");
  const ev = id ? state.events.find((e) => e.id === id) : null;
  state.selectedId = ev?.id || null;
  $("#panel-title").textContent = ev ? "Edit event" : "New event";
  $("#f-id").value = ev?.id || "";
  $("#f-title").value = ev?.title || "";
  $("#f-start").value = ev?.startLabel || "09:00";
  $("#f-end").value = ev?.endLabel || "10:00";
  $("#f-note").value = ev?.note || "";
  $("#f-color").value = ev?.color || "";
  state.draftColorIndex = ev?.colorIndex ?? state.events.length;
  state.draftChecklist = structuredClone(ev?.checklist || []);
  state.draftStickers = structuredClone(ev?.stickers || []);
  $("#f-delete").classList.toggle("hidden", !ev);
  renderSwatches();
  renderChecklist();
  renderStickers();
  panel.dataset.day = day || ev?.day || "";
  panel.classList.remove("hidden");
  $("#f-title").focus();
}

function closeEditor() {
  $("#detail-panel").classList.add("hidden");
  state.selectedId = null;
}

function renderSwatches() {
  const t = theme();
  const cur = $("#f-color").value;
  $("#f-colors").innerHTML = t.palette.map((c, i) =>
    `<button type="button" class="swatch ${(!cur && i === state.draftColorIndex) || cur === c ? "sel" : ""}" data-c="${c}" data-i="${i}" style="background:${c}"></button>`
  ).join("");
  $$("#f-colors .swatch").forEach((el) => {
    el.addEventListener("click", () => {
      $("#f-color").value = el.dataset.c;
      state.draftColorIndex = +el.dataset.i;
      renderSwatches();
    });
  });
}

function renderChecklist() {
  $("#f-checklist").innerHTML = state.draftChecklist.map((c, i) =>
    `<div class="check-item ${c.done ? "done" : ""}">
      <input type="checkbox" data-i="${i}" ${c.done ? "checked" : ""} />
      <span>${escapeXml(c.text)}</span>
      <button type="button" class="rm" data-i="${i}" aria-label="Remove">×</button>
    </div>`
  ).join("") || `<div class="empty-hint" style="padding:4px">No items yet</div>`;
  $$("#f-checklist input[type=checkbox]").forEach((el) => {
    el.addEventListener("change", () => { state.draftChecklist[+el.dataset.i].done = el.checked; renderChecklist(); });
  });
  $$("#f-checklist .rm").forEach((el) => {
    el.addEventListener("click", () => { state.draftChecklist.splice(+el.dataset.i, 1); renderChecklist(); });
  });
}

function renderStickers() {
  $("#f-stickers").innerHTML = state.draftStickers.map((s, i) =>
    `<button type="button" class="sticker-pill" data-i="${i}">${escapeXml(s.emoji)} ×</button>`
  ).join("") || `<div class="empty-hint" style="padding:4px">None</div>`;
  $$("#f-stickers .sticker-pill").forEach((el) => {
    el.addEventListener("click", () => { state.draftStickers.splice(+el.dataset.i, 1); renderStickers(); });
  });
}

async function saveEvent(e) {
  e.preventDefault();
  const id = $("#f-id").value || null;
  const body = {
    title: $("#f-title").value,
    start: $("#f-start").value,
    end: $("#f-end").value,
    note: $("#f-note").value,
    color: $("#f-color").value || null,
    colorIndex: state.draftColorIndex,
    checklist: state.draftChecklist,
    stickers: state.draftStickers.map((s, i) => ({ ...s, angle: s.angle ?? (i * 53) % 360 })),
    day: $("#detail-panel").dataset.day || null,
  };
  try {
    if (id) await api(`/events/${id}`, { method: "PUT", body });
    else await api("/events", { method: "POST", body });
    closeEditor();
    await refresh();
    toast(id ? "Event updated" : "Arc drawn ✏️");
  } catch (err) {
    toast(err.message);
  }
}

async function deleteEvent() {
  const id = $("#f-id").value;
  if (!id) return;
  if (!confirm("Delete this event?")) return;
  try {
    await api(`/events/${id}`, { method: "DELETE" });
    closeEditor();
    await refresh();
    toast("Deleted");
  } catch (err) { toast(err.message); }
}

/* ---------- THEME PANEL ---------- */
function openThemes() {
  const t = theme();
  $("#opt-stickers").checked = state.settings.showStickers !== false;
  $("#opt-mode-h24").checked = state.settings.clockMode === "h24";
  $("#theme-grid").innerHTML = Object.values(state.themes).map((th) =>
    `<button type="button" class="theme-btn ${th.id === state.settings.theme ? "sel" : ""}" data-id="${th.id}">
      <div class="dots">${th.palette.slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join("")}</div>
      ${escapeXml(th.name)}
    </button>`
  ).join("") || `<div class="empty-hint">Loading…</div>`;
  $$("#theme-grid .theme-btn").forEach((el) => {
    el.addEventListener("click", async () => {
      await api("/settings", { method: "PATCH", body: { theme: el.dataset.id } });
      await refresh();
      openThemes();
    });
  });
  $("#theme-panel").classList.remove("hidden");
}

/* ---------- WIRE UP ---------- */
function bind() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#btn-add").addEventListener("click", () => openEditor());
  $("#btn-now").addEventListener("click", () => { state.nowMin = nowMinutes(); render(); });
  $("#btn-theme").addEventListener("click", openThemes);
  $("#btn-settings").addEventListener("click", openThemes);
  $("#panel-close").addEventListener("click", closeEditor);
  $("#f-cancel").addEventListener("click", closeEditor);
  $("#f-delete").addEventListener("click", deleteEvent);
  $("#event-form").addEventListener("submit", saveEvent);
  $("#f-check-add").addEventListener("click", () => {
    const v = $("#f-check-input").value.trim();
    if (!v) return;
    state.draftChecklist.push({ text: v, done: false });
    $("#f-check-input").value = "";
    renderChecklist();
  });
  $("#f-check-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("#f-check-add").click(); }
  });
  $("#f-sticker-add").addEventListener("click", () => {
    const v = $("#f-sticker").value.trim() || "★";
    state.draftStickers.push({ emoji: v, angle: (state.draftStickers.length * 47 + 20) % 360, radius: 1.1 });
    $("#f-sticker").value = "";
    renderStickers();
  });
  $("#theme-close").addEventListener("click", () => $("#theme-panel").classList.add("hidden"));
  $("#opt-stickers").addEventListener("change", async (e) => {
    await api("/settings", { method: "PATCH", body: { showStickers: e.target.checked } });
    state.settings.showStickers = e.target.checked;
    render();
  });
  $("#opt-mode-h24").addEventListener("change", async (e) => {
    await api("/settings", { method: "PATCH", body: { clockMode: e.target.checked ? "h24" : "h12" } });
    state.settings.clockMode = e.target.checked ? "h24" : "h12";
    render();
  });
  $("#year-prev").addEventListener("click", () => { state.year--; renderYear(); });
  $("#year-next").addEventListener("click", () => { state.year++; renderYear(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeEditor(); $("#theme-panel").classList.add("hidden"); }
    if (e.key === "n" && !e.metaKey && !e.ctrlKey && !/input|textarea/i.test(document.activeElement?.tagName || "")) {
      openEditor();
    }
  });
}

async function boot() {
  window.__tp = { state, refresh, render, openEditor };
  bind();
  try { await refresh(); } catch (e) { console.error("TP boot failed", e); toast("Failed to load: " + e.message); }
  // live clock tick
  setInterval(() => {
    state.nowMin = nowMinutes();
    if (state.view === "day") { renderClock(); renderDayList(); }
    if (state.view === "week") renderWeek();
  }, 1000);
}

boot();
