// Map the Day! web server — static UI + REST API shared with CLI/MCP.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES, listThemes } from "../core/themes.js";
import * as store from "../core/store.js";
import { eventsAt, formatDuration, eventSummary, sortEvents } from "../core/events.js";
import { nowMinutes, minutesToTime } from "../core/clock.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = __dirname; // index.html, app.js, styles.css live here
const ASSETS = join(__dirname, "..", "..", "public", "assets");
const CORE = join(__dirname, "..", "core");
const PORT = +(process.env.PORT || process.env.TIMEPENCIL_PORT || 8585);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Invalid JSON body"); }
}

async function serveFile(res, path) {
  const rel = normalize(path).replace(/^(\.\.[/\\])+/, "");
  // assets/ → public/assets/; everything else → src/web/
  const abs = rel.startsWith("assets/")
    ? join(ASSETS, rel.slice("assets/".length))
    : join(WEB_ROOT, rel);
  try {
    const st = await stat(abs);
    if (!st.isFile()) throw new Error("nf");
    const ext = extname(abs).toLowerCase();
    const buf = await readFile(abs);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": buf.length,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
      "Accept-Ranges": "bytes",
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const method = req.method || "GET";

  // GET /api/health
  if (parts[1] === "health") return json(res, 200, { ok: true, app: "maptheday", now: minutesToTime(nowMinutes()), events: (await store.listEvents()).length });

  // GET /api/settings  PATCH /api/settings
  if (parts[1] === "settings") {
    if (method === "GET") return json(res, 200, await store.getSettings());
    if (method === "PATCH" || method === "PUT") return json(res, 200, await store.updateSettings(await readBody(req)));
  }

  // GET /api/themes
  if (parts[1] === "themes" && method === "GET") {
    return json(res, 200, listThemes().map((t) => ({
      ...t,
      ...THEMES[t.id], // face, ink, tick, palettes, etc. for CSS + SVG
    })));
  }

  // GET /api/events  POST /api/events
  if (parts[1] === "events") {
    if (method === "GET") {
      const day = url.searchParams.get("day");
      const events = sortEvents(await store.listEvents({ day }));
      return json(res, 200, events);
    }
    if (method === "POST") {
      try { return json(res, 201, await store.createEvent(await readBody(req))); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
  }

  // /api/events/:id
  if (parts[1] === "events" && parts[2]) {
    const id = decodeURIComponent(parts[2]);
    if (method === "GET") {
      const ev = await store.getEvent(id);
      return ev ? json(res, 200, ev) : json(res, 404, { error: "Not found" });
    }
    if (method === "PUT" || method === "PATCH") {
      try { return json(res, 200, await store.updateEvent(id, await readBody(req))); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (method === "DELETE") {
      try { return json(res, 200, { deleted: true, event: await store.deleteEvent(id) }); }
      catch (e) { return json(res, 404, { error: e.message }); }
    }
  }

  // POST /api/events/:id/checklist  body: {text}
  if (parts[1] === "events" && parts[2] && parts[3] === "checklist" && method === "POST") {
    try {
      const body = await readBody(req);
      return json(res, 200, await store.addChecklistItem(decodeURIComponent(parts[2]), body.text));
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // POST /api/events/:id/checklist/:itemId/toggle
  if (parts[1] === "events" && parts[2] && parts[3] === "checklist" && parts[4] && parts[5] === "toggle" && method === "POST") {
    try {
      return json(res, 200, await store.toggleChecklistItem(decodeURIComponent(parts[2]), decodeURIComponent(parts[4])));
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // GET /api/now
  if (parts[1] === "now" && method === "GET") {
    const now = nowMinutes();
    const events = sortEvents(eventsAt(now, await store.listEvents()));
    return json(res, 200, { now: minutesToTime(now), nowMinutes: now, events: events.map(eventSummary) });
  }

  // POST /api/seed
  if (parts[1] === "seed" && method === "POST") {
    const events = await store.seedDemo();
    return json(res, 200, { seeded: events.length });
  }

  return json(res, 404, { error: "Unknown API route" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    // ES modules from core
    if (url.pathname.startsWith("/core/")) {
      const name = url.pathname.replace("/core/", "");
      if (!/^[\w.-]+$/.test(name)) { res.writeHead(400); return res.end("Bad path"); }
      const p = join(CORE, name);
      const buf = await readFile(p);
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      return res.end(buf);
    }
    if (url.pathname === "/") return serveFile(res, "index.html");
    return serveFile(res, url.pathname.slice(1));
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

// Seed a demo day on first boot so the clock is never empty
await store.seedDemo().catch(() => {});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Map the Day! → http://0.0.0.0:${PORT}`);
  console.log(`Data store  → ${store.dataPath}`);
});
