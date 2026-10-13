#!/usr/bin/env node
// Map the Day! MCP server — Model Context Protocol tools for AI agents.
// stdio transport. Tools mirror the CLI + web API against the same JSON store.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as store from "../core/store.js";
import { listThemes, getTheme, pickColor } from "../core/themes.js";
import { eventSummary, sortEvents, formatDuration, eventsAt } from "../core/events.js";
import { nowMinutes, minutesToTime, timeToMinutes } from "../core/clock.js";

const server = new McpServer({
  name: "maptheday",
  version: "1.0.0",
});

function text(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function fail(err) {
  return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
}

function colorFor(ev, i, themeId) {
  if (ev.color) return ev.color;
  return pickColor(getTheme(themeId), ev.colorIndex ?? i ?? 0);
}

// ---------- schema fragments ----------
const timeStr = z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, "HH:MM or HH:MM:SS");
const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").describe("Calendar day");
const checklistItem = z.object({
  text: z.string().min(1),
  done: z.boolean().optional().default(false),
});
const stickerItem = z.object({
  emoji: z.string().min(1).max(8),
  angle: z.number().optional(),
  radius: z.number().optional(),
});

// ---------- tools ----------

server.tool(
  "maptheday_now",
  "What's happening on the Map the Day! clock right now. Returns current time and active events.",
  {},
  async () => {
    try {
      const now = nowMinutes();
      const events = sortEvents(eventsAt(now, await store.listEvents()));
      const settings = await store.getSettings();
      return text({
        now: minutesToTime(now),
        nowMinutes: now,
        theme: settings.theme,
        clockMode: settings.clockMode,
        events: events.map((ev) => ({ ...eventSummary(ev), color: colorFor(ev, events.indexOf(ev), settings.theme) })),
      });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_list_events",
  "List Map the Day! day-arc events. Optionally filter to one calendar day.",
  {
    day: dayStr.optional().describe("Only events assigned to this day (YYYY-MM-DD)"),
    summaries: z.boolean().optional().default(true).describe("Compact summaries vs full objects"),
  },
  async ({ day, summaries }) => {
    try {
      const settings = await store.getSettings();
      const events = sortEvents(await store.listEvents({ day: day || null }));
      if (summaries) {
        return text({
          count: events.length,
          events: events.map((ev, i) => ({
            ...eventSummary(ev),
            duration: formatDuration(ev.span),
            color: colorFor(ev, i, settings.theme),
          })),
        });
      }
      return text({ count: events.length, events });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_get_event",
  "Get one Map the Day! event by id, including checklist and stickers.",
  { id: z.string().min(1).describe("Event id") },
  async ({ id }) => {
    try {
      const ev = await store.getEvent(id);
      if (!ev) return fail(new Error(`Event not found: ${id}`));
      return text(ev);
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_create_event",
  "Create a colorful arc event on the Map the Day! day clock.",
  {
    title: z.string().min(1).max(80).describe("Event title shown on the arc"),
    start: timeStr.describe("Start time HH:MM"),
    end: timeStr.describe("End time HH:MM (may wrap past midnight)"),
    day: dayStr.optional().describe("Optional calendar day YYYY-MM-DD"),
    note: z.string().max(280).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional().describe("Hex color override"),
    colorIndex: z.number().int().min(0).optional().describe("Palette index if no hex color"),
    checklist: z.array(checklistItem).optional(),
    stickers: z.array(stickerItem).optional(),
  },
  async (args) => {
    try {
      const settings = await store.getSettings();
      const ev = await store.createEvent(args);
      return text({ created: true, event: { ...eventSummary(ev), color: colorFor(ev, settings.events, settings.theme) }, full: ev });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_update_event",
  "Update an existing Map the Day! event. Only provided fields change.",
  {
    id: z.string().min(1),
    title: z.string().min(1).max(80).optional(),
    start: timeStr.optional(),
    end: timeStr.optional(),
    day: dayStr.nullable().optional(),
    note: z.string().max(280).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).nullable().optional(),
    colorIndex: z.number().int().min(0).nullable().optional(),
    checklist: z.array(checklistItem).optional().describe("Replace entire checklist"),
    stickers: z.array(stickerItem).optional().describe("Replace stickers"),
  },
  async (args) => {
    try {
      const { id, ...patch } = args;
      if (patch.day === null) patch.day = null;
      const ev = await store.updateEvent(id, patch);
      return text({ updated: true, event: eventSummary(ev), full: ev });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_delete_event",
  "Delete a Map the Day! event by id.",
  { id: z.string().min(1) },
  async ({ id }) => {
    try {
      const ev = await store.deleteEvent(id);
      return text({ deleted: true, event: eventSummary(ev) });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_toggle_check",
  "Toggle a checklist item on an event by item id or exact text.",
  {
    eventId: z.string().min(1),
    itemId: z.string().optional().describe("Checklist item id"),
    text: z.string().optional().describe("Exact checklist item text (if no itemId)"),
  },
  async ({ eventId, itemId, text: txt }) => {
    try {
      if (!itemId && !txt) return fail(new Error("Provide itemId or text"));
      const ev = await store.toggleChecklistItem(eventId, itemId || txt);
      return text({ toggled: true, event: eventSummary(ev), checklist: ev.checklist });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_add_check",
  "Append a checklist item to an event.",
  { eventId: z.string().min(1), text: z.string().min(1) },
  async ({ eventId, text: txt }) => {
    try {
      const ev = await store.addChecklistItem(eventId, txt);
      return text({ added: true, event: eventSummary(ev), checklist: ev.checklist });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_list_themes",
  "List visual themes (paper, dark, forest, sepia, midnight, bloom) with palettes.",
  {},
  async () => {
    try {
      const settings = await store.getSettings();
      return text({
        active: settings.theme,
        themes: listThemes().map((t) => ({ ...getTheme(t.id), id: t.id, name: t.name })),
      });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_set_theme",
  "Set the active visual theme of the Map the Day! clock.",
  { theme: z.enum(["paper", "dark", "forest", "sepia", "midnight", "bloom"]) },
  async ({ theme }) => {
    try {
      const s = await store.updateSettings({ theme });
      return text({ settings: s });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_set_mode",
  "Set clock mode to 12-hour or 24-hour dial.",
  { mode: z.enum(["h12", "h24"]) },
  async ({ mode }) => {
    try {
      const s = await store.updateSettings({ clockMode: mode });
      return text({ settings: s });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_get_settings",
  "Get all Map the Day! settings (theme, clockMode, timezone, weekStart, showStickers).",
  {},
  async () => {
    try { return text(await store.getSettings()); }
    catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_update_settings",
  "Patch Map the Day! settings. Only provided keys change.",
  {
    theme: z.enum(["paper", "dark", "forest", "sepia", "midnight", "bloom"]).optional(),
    clockMode: z.enum(["h12", "h24"]).optional(),
    timezone: z.string().nullable().optional(),
    weekStart: z.number().int().min(0).max(6).optional().describe("0=Sunday"),
    showStickers: z.boolean().optional(),
  },
  async (patch) => {
    try {
      const s = await store.updateSettings(patch);
      return text({ settings: s });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_seed_demo",
  "Seed a demo day of events if the clock is empty (Coffee, Deep Work, Brunch, Beach, Gym, Movie).",
  { force: z.boolean().optional().default(false).describe("Clear all events first") },
  async ({ force }) => {
    try {
      if (force) await store.clearEvents({});
      const events = await store.seedDemo();
      return text({ seeded: events.length, events: events.map(eventSummary) });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_clear_events",
  "Delete all events, optionally only for one day. Destructive — use with care.",
  {
    day: dayStr.optional().describe("Only clear this day"),
    confirm: z.literal(true).describe("Must be true to confirm deletion"),
  },
  async ({ day, confirm }) => {
    try {
      if (!confirm) return fail(new Error("Confirmation required"));
      const n = await store.clearEvents({ day: day || null });
      return text({ cleared: n });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  "maptheday_data_path",
  "Print the filesystem path of the shared JSON data store.",
  {},
  async () => text({ path: store.dataPath })
);

// ---------- boot ----------
const transport = new StdioServerTransport();
await server.connect(transport);
// stderr is safe for logs on stdio MCP
console.error(`maptheday-mcp ready (store: ${store.dataPath})`);
