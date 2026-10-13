// Map the Day! events: colorful day arcs with labels, checklists, stickers.
import { randomUUID } from "node:crypto";
import { timeToMinutes, minutesToTime, normalizeRange } from "./clock.js";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function shortId() {
  const bytes = randomUUID().replace(/-/g, "");
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += ID_ALPHABET[parseInt(bytes.slice(i * 2, i * 2 + 2), 16) % 36];
  }
  return id;
}

/** Validate + normalize an event draft into a stored event. */
export function normalizeEvent(input, { existing = null, now = new Date() } = {}) {
  const base = existing || {
    id: input.id || shortId(),
    createdAt: now.toISOString(),
  };
  const title = String(input.title ?? base.title ?? "").trim();
  if (!title) throw new Error("Event title is required");

  let start, end;
  if (input.start != null) start = typeof input.start === "number" ? input.start : timeToMinutes(input.start);
  else start = base.startMin ?? 9 * 60;
  if (input.end != null) end = typeof input.end === "number" ? input.end : timeToMinutes(input.end);
  else end = base.endMin ?? start + 60;

  const range = normalizeRange(start, end);

  const checklist = Array.isArray(input.checklist)
    ? input.checklist.map((c, i) => {
        if (typeof c === "string") return { id: shortId(), text: c, done: false, order: i };
        return {
          id: c.id || shortId(),
          text: String(c.text ?? "").trim(),
          done: Boolean(c.done),
          order: i,
        };
      }).filter((c) => c.text)
    : base.checklist || [];

  const stickers = Array.isArray(input.stickers)
    ? input.stickers.map((s, i) => ({
        id: s.id || shortId(),
        emoji: s.emoji || s.text || "★",
        angle: Number(s.angle ?? (i * 47) % 360),
        radius: Number(s.radius ?? 1.08),
      }))
    : base.stickers || [];

  return {
    ...base,
    title,
    note: String(input.note ?? base.note ?? ""),
    startMin: range.startMin,
    endMin: range.endMin,
    overnight: range.overnight,
    span: range.span,
    startLabel: minutesToTime(range.startMin),
    endLabel: minutesToTime(range.endMin),
    color: input.color != null ? String(input.color) : base.color ?? null,
    colorIndex: Number.isFinite(input.colorIndex) ? input.colorIndex : base.colorIndex ?? null,
    day: input.day != null ? String(input.day) : base.day ?? null, // YYYY-MM-DD or null=all-day recurrence field
    checklist,
    stickers,
    updatedAt: now.toISOString(),
  };
}

export function eventSummary(ev) {
  return {
    id: ev.id,
    title: ev.title,
    start: ev.startLabel,
    end: ev.endLabel,
    overnight: ev.overnight,
    color: ev.color,
    day: ev.day,
    checklist: ev.checklist?.length || 0,
    done: ev.checklist?.filter((c) => c.done).length || 0,
    stickers: ev.stickers?.length || 0,
  };
}

/** Events overlapping a minute-of-day (for "what's now"). */
export function eventsAt(nowMin, events, { day = null } = {}) {
  const m = ((nowMin % 1440) + 1440) % 1440;
  return events.filter((ev) => {
    if (day && ev.day && ev.day !== day) return false;
    if (ev.overnight) return m >= ev.startMin || m < ev.endMin;
    return m >= ev.startMin && m < ev.endMin;
  });
}

/** Sort by start then title. */
export function sortEvents(events) {
  return [...events].sort((a, b) => a.startMin - b.startMin || a.title.localeCompare(b.title));
}

export function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
