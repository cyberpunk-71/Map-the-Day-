# Map the Day!

A planner that's just a clock. Draw your day as colorful arcs around it — transient and glanceable like a wall clock.

Recreation of [Map the Day!](https://play.google.com/store/apps/details?id=com.vinee.maptheday2) with full **CLI** and **MCP** support for AI agents.

## Features

- **Circular day clock** — events as thick colorful arcs (round-cap strokes) on a 12h/24h dial
- **Live now-hand** — orange hand + glow on the current event
- **Checklists** — items on each event (`✓ 2/3`)
- **Stickers** — emoji markers placed around the dial (`☕ 🏖️ 💪`)
- **Themes** — Paper, Dark, Forest, Sepia, Midnight, Bloom
- **Week & Year views** — mini-clocks per day; month grid with event density
- **No sign-in** — local JSON store, zero network required
- **CLI + MCP** — full agent control surface over the same store as the UI

## Quick start

```bash
cd /home/opc/maptheday-app
npm install
npm start          # web app → http://0.0.0.0:8585
```

## CLI (`maptheday` / `tp`)

Installed on PATH as `maptheday` and `tp`.

```bash
tp list
tp add --title "Deep Work" --start 09:00 --end 11:30 \
       --check "Ship feature" --check "Code review" --sticker "🧠"
tp now --json
tp check <eventId> "Ship feature"
tp set-theme midnight
tp set-mode h24
tp list --day 2026-10-13 --json
tp delete <id>
tp seed            # demo day if empty
tp help
```

Every command accepts `--json` for machine-readable output.

## MCP server

stdio MCP with 16 tools. Binary: `maptheday-mcp`

| Tool | Purpose |
|------|---------|
| `maptheday_now` | What's on the clock right now |
| `maptheday_list_events` | List arcs (optional day filter) |
| `maptheday_get_event` | Full event + checklist + stickers |
| `maptheday_create_event` | Draw a new arc |
| `maptheday_update_event` | Edit fields |
| `maptheday_delete_event` | Remove arc |
| `maptheday_toggle_check` | Toggle checklist item |
| `maptheday_add_check` | Append checklist item |
| `maptheday_list_themes` | Themes + palettes |
| `maptheday_set_theme` | paper\|dark\|forest\|sepia\|midnight\|bloom |
| `maptheday_set_mode` | h12 \| h24 |
| `maptheday_get_settings` | All settings |
| `maptheday_update_settings` | Patch settings |
| `maptheday_seed_demo` | Seed demo day |
| `maptheday_clear_events` | Destructive clear (confirm required) |
| `maptheday_data_path` | Store location |

### OpenCode

Already registered in `~/.config/opencode/opencode.jsonc`:

```jsonc
"maptheday": {
  "type": "local",
  "command": ["node", "/home/opc/maptheday-app/src/mcp/index.js"],
  "enabled": true
}
```

### Claude Code / other MCP clients

```bash
claude mcp add maptheday -- node /home/opc/maptheday-app/src/mcp/index.js
```

## Architecture

```
src/core/clock.js     # angles, arc paths, ticks, HH:MM ↔ minutes
src/core/events.js    # normalize, summary, now-overlap
src/core/themes.js    # 6 themes × 12-color palettes
src/core/store.js     # shared JSON store (web + CLI + MCP)
src/web/              # SVG clock UI + REST API server
src/cli/index.js      # maptheday / tp
src/mcp/index.js      # MCP stdio server
data/maptheday.json  # single source of truth
```

## API (web server)

```
GET    /api/health
GET    /api/settings          PATCH /api/settings
GET    /api/themes
GET    /api/events?day=       POST  /api/events
GET    /api/events/:id        PUT   /api/events/:id     DELETE /api/events/:id
POST   /api/events/:id/checklist
POST   /api/events/:id/checklist/:itemId/toggle
GET    /api/now
POST   /api/seed
```

## License

MIT — clone for learning; original app by Vineet Kapil.
