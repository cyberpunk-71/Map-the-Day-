// Map the Day! store: JSON file persistence for events + settings.
// Shared by web server, CLI, and MCP so agents and UI always see one truth.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_THEME, getTheme } from "./themes.js";
import { normalizeEvent, shortId } from "./events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TIMEPENCIL_DATA || join(__dirname, "..", "..", "data");
const DB_PATH = join(ROOT, "maptheday.json");

const EMPTY = {
  version: 1,
  settings: {
    theme: DEFAULT_THEME,
    clockMode: "h12", // h12 | h24
    timezone: null,   // null = local
    weekStart: 1,     // 0=Sun
    showStickers: true,
  },
  events: [],
  meta: { updatedAt: new Date(0).toISOString() },
};

async function ensureDir() {
  await mkdir(dirname(DB_PATH), { recursive: true });
}

export async function loadDB() {
  try {
    const raw = await readFile(DB_PATH, "utf8");
    const db = JSON.parse(raw);
    return {
      ...EMPTY,
      ...db,
      settings: { ...EMPTY.settings, ...(db.settings || {}) },
      events: Array.isArray(db.events) ? db.events : [],
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

export async function saveDB(db) {
  await ensureDir();
  db.meta = { ...(db.meta || {}), updatedAt: new Date().toISOString() };
  const tmp = DB_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await rename(tmp, DB_PATH);
  return db;
}

export async function getSettings() {
  const db = await loadDB();
  return db.settings;
}

export async function updateSettings(patch) {
  const db = await loadDB();
  db.settings = { ...db.settings, ...patch };
  if (db.settings.theme && !getTheme(db.settings.theme)) db.settings.theme = DEFAULT_THEME;
  if (!["h12", "h24"].includes(db.settings.clockMode)) db.settings.clockMode = "h12";
  await saveDB(db);
  return db.settings;
}

export async function listEvents({ day = null } = {}) {
  const db = await loadDB();
  if (!day) return db.events;
  return db.events.filter((e) => !e.day || e.day === day);
}

export async function getEvent(id) {
  const db = await loadDB();
  return db.events.find((e) => e.id === id) || null;
}

export async function createEvent(input) {
  const db = await loadDB();
  const ev = normalizeEvent({ id: input.id || shortId(), ...input }, { existing: null });
  if (db.events.some((e) => e.id === ev.id)) throw new Error(`Event id already exists: ${ev.id}`);
  if (ev.color == null && ev.colorIndex == null) {
    ev.colorIndex = db.events.length;
  }
  db.events.push(ev);
  await saveDB(db);
  return ev;
}

export async function updateEvent(id, patch) {
  const db = await loadDB();
  const idx = db.events.findIndex((e) => e.id === id);
  if (idx < 0) throw new Error(`Event not found: ${id}`);
  const ev = normalizeEvent({ ...patch, id }, { existing: db.events[idx] });
  db.events[idx] = ev;
  await saveDB(db);
  return ev;
}

export async function deleteEvent(id) {
  const db = await loadDB();
  const idx = db.events.findIndex((e) => e.id === id);
  if (idx < 0) throw new Error(`Event not found: ${id}`);
  const [ev] = db.events.splice(idx, 1);
  await saveDB(db);
  return ev;
}

export async function clearEvents({ day = null } = {}) {
  const db = await loadDB();
  if (!day) {
    const n = db.events.length;
    db.events = [];
    await saveDB(db);
    return n;
  }
  const before = db.events.length;
  db.events = db.events.filter((e) => e.day !== day);
  await saveDB(db);
  return before - db.events.length;
}

export async function toggleChecklistItem(eventId, itemId) {
  const db = await loadDB();
  const ev = db.events.find((e) => e.id === eventId);
  if (!ev) throw new Error(`Event not found: ${eventId}`);
  const item = (ev.checklist || []).find((c) => c.id === itemId || c.text === itemId);
  if (!item) throw new Error(`Checklist item not found: ${itemId}`);
  item.done = !item.done;
  ev.updatedAt = new Date().toISOString();
  await saveDB(db);
  return ev;
}

export async function addChecklistItem(eventId, text) {
  const db = await loadDB();
  const ev = db.events.find((e) => e.id === eventId);
  if (!ev) throw new Error(`Event not found: ${eventId}`);
  ev.checklist = ev.checklist || [];
  const item = { id: shortId(), text: String(text).trim(), done: false, order: ev.checklist.length };
  if (!item.text) throw new Error("Checklist text is required");
  ev.checklist.push(item);
  ev.updatedAt = new Date().toISOString();
  await saveDB(db);
  return ev;
}

/** Seed demo day if empty — mirrors the app's showcase screenshots. */
export async function seedDemo() {
  const db = await loadDB();
  if (db.events.length) return db.events;
  const demo = [
    { title: "Morning Coffee", start: "07:30", end: "08:00", checklist: ["Brew pour-over", "Read headlines"], stickers: [{ emoji: "☕", angle: 30 }] },
    { title: "Deep Work", start: "09:00", end: "11:30", checklist: ["Ship feature", "Code review", "No meetings block"], stickers: [{ emoji: "🧠", angle: 90 }] },
    { title: "Brunch", start: "12:00", end: "13:00", checklist: ["Pancakes", "Fresh juice", "Call family"], stickers: [{ emoji: "🥞", angle: 180 }, { emoji: "🍊", angle: 200 }] },
    { title: "Beach Walk", start: "15:00", end: "16:30", stickers: [{ emoji: "🏖️", angle: 225 }, { emoji: "🌊", angle: 240 }] },
    { title: "Gym", start: "18:00", end: "19:00", checklist: ["Warm-up", "Push day", "Stretch"], stickers: [{ emoji: "💪", angle: 270 }] },
    { title: "Dinner & Movie", start: "20:00", end: "22:00", stickers: [{ emoji: "🎬", angle: 315 }] },
  ];
  for (const d of demo) {
    db.events.push(normalizeEvent(d, { existing: null }));
  }
  await saveDB(db);
  return db.events;
}

export const dataPath = DB_PATH;
