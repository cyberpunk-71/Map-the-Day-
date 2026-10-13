#!/usr/bin/env node
// maptheday (tp) — CLI for AI agents and humans.
// Deterministic JSON output with --json; human tables by default.
import { parseArgs } from "node:util";
import * as store from "../core/store.js";
import { listThemes, getTheme, pickColor } from "../core/themes.js";
import { eventSummary, sortEvents, formatDuration, eventsAt } from "../core/events.js";
import { nowMinutes, minutesToTime, timeToMinutes } from "../core/clock.js";

const HELP = `maptheday (tp) — draw your day as colorful arcs around a clock

USAGE
  tp <command> [options]

EVENTS
  list [--day YYYY-MM-DD] [--json]     List events (optionally filter by day)
  add --title T --start HH:MM --end HH:MM
       [--day YYYY-MM-DD] [--color #hex] [--color-index N]
       [--note TEXT] [--check "item1" --check "item2"]
       [--sticker "🏖️"] [--json]
  get <id> [--json]                    Show one event
  update <id> [--title ... --start ... --end ... --color ... --note ...]
       [--check ...] [--sticker ...] [--clear-checklist] [--json]
  delete <id> [--json]                 Delete event
  now [--json]                         What's happening right now
  clear [--day YYYY-MM-DD] [--yes] [--json]

CHECKLISTS
  check <eventId> <text|--id itemId>   Toggle a checklist item
  uncheck <eventId> <text|--id itemId> (alias of check)

SETTINGS & THEMES
  settings [--json]                    Show settings
  set-theme <themeId>                  paper|dark|forest|sepia|midnight|bloom
  set-mode <h12|h24>                   Clock mode
  themes [--json]                      List themes
  set --key K --value V [--json]       Generic settings patch

DEMO / DATA
  seed [--force] [--json]              Seed demo day if empty
  path [--json]                        Print data file path
  serve [--port N]                     Start web app (delegates to server)
  help                                 This help

GLOBAL
  --json                               Machine-readable output (for agents)
  --quiet                              Suppress non-essential output

EXAMPLES
  tp add --title "Deep Work" --start 09:00 --end 11:30 --check "Ship feature" --check "Review"
  tp list --json | jq '.events[].title'
  tp now --json
  tp set-theme midnight
  tp check <eventId> "Ship feature"
`;

function out(obj, human) {
  if (globalThis.__TP_JSON) {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  } else if (human != null) {
    process.stdout.write(human + "\n");
  } else {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  }
}

function die(msg, code = 1) {
  if (globalThis.__TP_JSON) process.stdout.write(JSON.stringify({ error: msg }) + "\n");
  else process.stderr.write(`error: ${msg}\n`);
  process.exit(code);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    json: { type: "boolean" },
    quiet: { type: "boolean" },
    day: { type: "string" },
    title: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    color: { type: "string" },
    "color-index": { type: "string" },
    note: { type: "string" },
    check: { type: "string", multiple: true },
    sticker: { type: "string", multiple: true },
    "clear-checklist": { type: "boolean" },
    "clear-stickers": { type: "boolean" },
    force: { type: "boolean" },
    yes: { type: "boolean", short: "y" },
    port: { type: "string" },
    key: { type: "string" },
    value: { type: "string" },
    id: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

globalThis.__TP_JSON = Boolean(values.json);
const cmd = positionals[0];
const arg1 = positionals[1];
const arg2 = positionals[2];

if (!cmd || values.help || cmd === "help") {
  process.stdout.write(HELP);
  process.exit(0);
}

function collectChecklist() {
  if (!values.check?.length) return undefined;
  return values.check.map((text) => ({ text, done: false }));
}

function collectStickers() {
  if (!values.sticker?.length) return undefined;
  return values.sticker.map((emoji, i) => ({ emoji, angle: (i * 47 + 20) % 360, radius: 1.1 }));
}

function buildPatch() {
  const p = {};
  if (values.title != null) p.title = values.title;
  if (values.start != null) p.start = values.start;
  if (values.end != null) p.end = values.end;
  if (values.color != null) p.color = values.color;
  if (values["color-index"] != null) p.colorIndex = +values["color-index"];
  if (values.note != null) p.note = values.note;
  if (values.day != null) p.day = values.day || null;
  const cl = collectChecklist();
  if (cl) p.checklist = cl;
  if (values["clear-checklist"]) p.checklist = [];
  const st = collectStickers();
  if (st) p.stickers = st;
  if (values["clear-stickers"]) p.stickers = [];
  return p;
}

async function printEvents(events, { summaries = true } = {}) {
  if (!events.length) return out({ events: [], count: 0 }, "no events");
  const t = getTheme((await store.getSettings()).theme);
  const rows = events.map((ev, i) => {
    const color = ev.color || pickColor(t, ev.colorIndex ?? i);
    const done = (ev.checklist || []).filter((c) => c.done).length;
    const total = (ev.checklist || []).length;
    return {
      ...eventSummary(ev),
      color,
      duration: formatDuration(ev.span),
      progress: total ? `${done}/${total}` : null,
    };
  });
  const human = rows.map((r) =>
    `${r.color}  ${r.start}–${r.end}${r.overnight ? " +" : ""}  ${r.title}${r.progress ? `  [${r.progress}]` : ""}${r.stickers ? "  " + (events.find((e) => e.id === r.id)?.stickers || []).map((s) => s.emoji).join("") : ""}  (${r.id})`
  ).join("\n");
  out({ events: rows, count: rows.length }, human);
}

async function main() {
  switch (cmd) {
    case "list":
    case "ls": {
      const events = sortEvents(await store.listEvents({ day: values.day || null }));
      return printEvents(events);
    }
    case "add": {
      if (!values.title) die("--title is required");
      if (!values.start || !values.end) die("--start and --end are required");
      const patch = buildPatch();
      if (!patch.day && values.day !== "") patch.day = values.day || null;
      const ev = await store.createEvent({
        title: values.title,
        start: values.start,
        end: values.end,
        ...patch,
      });
      return out({ event: eventSummary(ev), full: ev }, `created ${ev.id}  ${ev.startLabel}–${ev.endLabel}  ${ev.title}`);
    }
    case "get": {
      if (!arg1) die("event id required");
      const ev = await store.getEvent(arg1);
      if (!ev) die(`event not found: ${arg1}`);
      return out(ev, JSON.stringify(ev, null, 2));
    }
    case "update":
    case "edit": {
      if (!arg1) die("event id required");
      const ev = await store.updateEvent(arg1, buildPatch());
      return out({ event: eventSummary(ev), full: ev }, `updated ${ev.id}  ${ev.title}`);
    }
    case "delete":
    case "rm": {
      if (!arg1) die("event id required");
      const ev = await store.deleteEvent(arg1);
      return out({ deleted: true, event: eventSummary(ev) }, `deleted ${ev.id}  ${ev.title}`);
    }
    case "clear": {
      if (!values.yes && !values.json) die("refusing to clear without --yes");
      const n = await store.clearEvents({ day: values.day || null });
      return out({ cleared: n }, `cleared ${n} events`);
    }
    case "now": {
      const now = nowMinutes();
      const events = sortEvents(eventsAt(now, await store.listEvents()));
      const body = { now: minutesToTime(now), nowMinutes: now, events: events.map(eventSummary) };
      return out(body, events.length
        ? `${body.now}  →  ${events.map((e) => e.title).join(" · ")}`
        : `${body.now}  →  (free)`);
    }
    case "check":
    case "uncheck": {
      if (!arg1 || (!arg2 && !values.id)) die("usage: tp check <eventId> <text|--id itemId>");
      const ev = await store.toggleChecklistItem(arg1, values.id || arg2);
      return out({ event: eventSummary(ev), full: ev }, `toggled on ${ev.title}: ${ev.checklist.map((c) => `${c.done ? "✓" : "○"} ${c.text}`).join("; ")}`);
    }
    case "settings": {
      const s = await store.getSettings();
      return out(s, Object.entries(s).map(([k, v]) => `${k}: ${v}`).join("\n"));
    }
    case "set-theme": {
      if (!arg1) die("theme id required");
      const s = await store.updateSettings({ theme: arg1 });
      return out(s, `theme = ${s.theme}`);
    }
    case "set-mode": {
      if (!arg1 || !["h12", "h24"].includes(arg1)) die("mode must be h12 or h24");
      const s = await store.updateSettings({ clockMode: arg1 });
      return out(s, `clockMode = ${s.clockMode}`);
    }
    case "themes": {
      const themes = listThemes().map((t) => ({ ...t, palette: getTheme(t.id).palette }));
      return out({ themes }, themes.map((t) => `${t.id.padEnd(10)} ${t.name}  ${t.palette.slice(0, 6).join(" ")}`).join("\n"));
    }
    case "set": {
      if (!values.key) die("--key is required");
      let v = values.value;
      if (v === "true") v = true;
      else if (v === "false") v = false;
      else if (v === "null") v = null;
      else if (v != null && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
      const s = await store.updateSettings({ [values.key]: v });
      return out(s, `${values.key} = ${s[values.key]}`);
    }
    case "seed": {
      if (values.force) {
        await store.clearEvents({});
      }
      const events = await store.seedDemo();
      return out({ count: events.length, events: events.map(eventSummary) }, `seeded ${events.length} demo events`);
    }
    case "path":
      return out({ path: store.dataPath }, store.dataPath);
    case "serve": {
      const port = values.port || process.env.PORT || "8585";
      process.env.PORT = port;
      await import("../web/server.js");
      return; // server keeps process alive
    }
    default:
      die(`unknown command: ${cmd}\n\nRun: tp help`);
  }
}

main().catch((e) => die(e.message));
