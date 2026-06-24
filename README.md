# AVN Hub

> A self-hosted widget playground for building, placing, and remixing AI-generated dashboard cards.

AVN Hub is a living personal card that treats the dashboard as a canvas. Start with the bundled example widgets, ask NutBot to generate new ones, write your own when you want finer control, and arrange everything through a resizable slot grid. The point is not one fixed dashboard. The point is an environment you can keep reshaping into whatever you want it to be.

---

![AVN Hub dark mode canvas with the slot grid, NutBot terminal, live widgets, and side control tabs](<docs/screenshots/display dark mode.png>)

![AVN Hub light mode canvas showing the same widget layout with a different palette](<docs/screenshots/display light mode.png>)

---

## What it is

Not a portfolio. Not a status page. AVN Hub is a customizable widget system for making a personal interface out of whatever matters to you: live data, tiny tools, generated experiments, identity cards, control panels, toys, utilities, or anything else an LLM or developer can express as a React widget.

The included live-data and identity widgets are examples of what the framework can do. They are not the limit of the project. The main loop is: create a widget, place it on the grid, resize it, reposition it, optionally enable Hover On Expand, and keep iterating until the hub feels like yours.

**Built with:** Next.js · Tailwind CSS · Framer Motion · TypeScript  
**Deployed on:** Self-hosted Docker, accessed privately over Tailscale (no public domain needed)

---

## Features

### A canvas for custom widgets

AVN Hub is built around widgets as the primary unit of expression. A widget can be a live integration, a personal stat, a generated mini-app, a dashboard control, a visual experiment, or a completely custom interface. Once registered, every widget gets the same framework behavior automatically:

- Placement in the Slot Layout grid
- Drag-to-reposition in edit mode
- Edge-handle resizing
- Per-size layouts for small, medium, and large views
- Per-widget settings
- Optional Hover On Expand previews
- Persistence in local storage

The bundled widgets are included to make the card useful on day one and to show patterns for future widgets. They are examples, not the center of gravity.

---

### Themeable dashboard canvas

The main view is a living canvas: left and right widget regions, a base strip, and a fixed center terminal slot for NutBot. The dark and light screenshots above show the same widget system under different theme modes, and palettes can shift the same layout from warm graphite to bright berry or pale sticker-card surfaces without changing widget code.

Theme mode and palette are controlled from Hub Core settings and persisted in `localStorage`, so the card comes back exactly how you left it.

![AVN Hub sea green palette](<docs/screenshots/display with sea green color.png>)

![AVN Hub berry palette](<docs/screenshots/display with berry color.png>)

![Hub Core appearance settings with all palette options](<docs/screenshots/all the color options.png>)

---

### AVN Hub Canvases — one card, multiple contexts

A vertical pill stack on the edge of the frame lets you keep several independent named layouts — home, work, entertainment, whatever contexts you actually live in — and switch between them in one click. Each canvas has its **own** widget arrangement, theme mode, palette, and wallpaper, so switching canvases re-skins the whole card, not just the grid. Double-click a pill to rename it or pick an icon; the "+" button asks for a name and icon *before* creating anything, so a stray click can't spawn a layout you have to clean up.

---

### Personalization — wallpapers, backdrop modes, and ambient sound

Three independent, stacked layers, each per-canvas:

- **BG** — an optional wallpaper behind everything: a photo, or a short looping video (muted, autoplay). Drag-drop or browse to set it from Hub Core → Appearance.
- **Canvas backdrop** — solid, blurred (frosted glass), or fully transparent, controlling how much of the wallpaper shows through behind the grid.
- **Widget backdrop** — a separate, independent solid/blur/transparent default for every widget card, with the option to override any single widget from its own gear menu.

Toggle **mouse parallax** to have the wallpaper subtly track the cursor.

Pair it with the **Ambient Sound** widget — rain, wind, drone, and room-tone presets synthesized live (no audio files shipped), plus the ability to upload your own looping clips, with a real-time bar visualizer while it plays.

---

### NutBot Widget Creator — build widgets by describing them

![NutBot Widget Creator close-up](<docs/screenshots/Widget Creator.png>)

NutBot's `CREATOR` tab is an in-dashboard AI terminal for expanding the hub from inside the hub. Describe the widget you want, choose its size and layout options, and NutBot generates the React component and wires it into the dashboard without manual file editing.

- Powered by your choice of CLI backend: **Claude Code**, **OpenCode**, or **Codex**
- Auto-fallback chain: if one hits a rate limit it hands off to the next
- TypeScript-checked before registration; rolls back automatically on failure
- Create and edit modes for generated widgets
- Identity fields for name, icon, and slug
- Size and orientation options (`S`, `M`, `L`, horizontal, vertical)
- Optional Hover On Expand setting at creation time
- Per-size content prompts so small, medium, and large layouts can each do something different
- Created widgets are drag-placeable, resizable, and configurable like any bundled widget

---

### Slot grid layout and edit mode

![Edit mode with resize handles, move handles, widget settings buttons, and empty add slots](<docs/screenshots/edit mode.png>)

The dashboard is a three-region slot grid: left column, right column, and a base strip, with NutBot living in the center terminal slot. The grid is the main editing surface. In **edit mode**:

- **Drag** any widget to a new cell with the move handle
- **Resize** by dragging any of the four edge handles
- **Configure** a widget with its gear menu, including widget-specific settings and Hover On Expand
- **Add** widgets from the widget manager into any region that has space
- **Add directly** from empty `+` cells when edit mode exposes open slots
- **Remove** widgets back to the available pool (never deleted)

Lock the layout when done to prevent accidental changes. Custom widgets and bundled widgets use the same placement system, so generated widgets can be mixed freely with anything already on the card.

![Edit mode with many empty add slots](<docs/screenshots/display with nowidgets in edit mode.png>)

---

### Resizable, expressive widgets

Widgets are not just scaled copies of themselves. They can render different interfaces at small, medium, and large sizes. A compact widget might show one value, a medium widget might add controls, and a large widget might become a full panel with richer detail.

Each widget declares which sizes and orientations it supports, and the framework handles the rest: chrome, settings, layout persistence, resize constraints, and edit-mode controls. The Slot Layout regions can also change their grid counts from Hub Core, so a tight 2-column sidebar can become a larger placement grid when you want more empty cells and finer control.

![Customized grid counts with more placement cells](<docs/screenshots/display showing how grid can be customized.png>)

---

### Hover On Expand (HOE)

Enable HOE per widget from its gear menu or while creating a widget in NutBot. Hover over a widget to preview a larger version in place while nearby edge-touching widgets temporarily contract to make room. The preview is transient: no layout is saved, no widget is permanently resized, and it only runs on fine-pointer devices outside edit mode.

![Hover On Expand preview showing a widget temporarily expanded in place](<docs/screenshots/expandable widgets.png>)

---

### Widget Manager

![Widget manager with search, import, filters, placed widgets, and available widgets](<docs/screenshots/widget manager.png>)

The Widget Manager tab lists every placed widget with its region and every available widget waiting to be placed. Search by widget name or id, filter by bundled/custom widgets, import a widget exported as a `.zip`, remove placed widgets, and add available widgets back into open regions. Custom widgets created by NutBot appear here automatically alongside bundled examples.

---

### Hub Core — settings without leaving the page

![AVN Hub Canvas Settings menu with appearance, general, and layout controls](<docs/screenshots/AVN Hub Canvas Settings.png>)

A fixed control strip on the edge of the canvas. Always reachable regardless of layout. Three tabs:

- **Wrench/Lock** — toggle edit mode in one click
- **Settings** — theme, palette, global prefs, layout reset, region grid-size controls (rows × cols per region), layout export/import
- **Widget Manager** — add, remove, export, delete custom widgets

The settings panel is not exclusive-collapse: Appearance, General, and Layout can stay open together while you adjust theme, palette, boot/polling preferences, grid counts, and layout files.

---

### Bundled example widgets

AVN Hub ships with a working set of widgets so the playground has real texture immediately: identity, music, games, homelab status, live system stats (real CPU/memory/disk/network for the machine AVN Hub runs on, not mock data), GitHub activity, clock/date, quicklinks, ambient sound, and NutBot itself. Use them as-is, delete the ones that do not fit, or treat them as reference implementations for your own generated or hand-written widgets.

---

### Two fully-designed themes, eight palettes

Both dark and light modes are first-class — not an afterthought. Eight colour palettes (ember, slate, moss, plum, reef, raspberry, circuit, graphite) each have complete dark and light variants. Switch from Hub Core settings. Persisted to `localStorage`, applied pre-paint so there's never a flash of the wrong theme.

---

## Self-hosting

### Requirements

- Node.js 20+
- Docker + Docker Compose
- A [Tailscale](https://tailscale.com) account (free) for private HTTPS

### 1. Clone & configure

```bash
git clone https://github.com/Zohaib2244/AVN-Hub.git
cd AVN-Hub
cp .env.local.example .env.local   # fill in your API keys
```

### 2. Environment variables

The bundled example widgets use these integrations when configured. Custom widgets can add their own API routes and settings as needed.

```env
# Spotify (Authorization Code flow)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=

# Steam
STEAM_API_KEY=
STEAM_PROFILE_ID=        # e.g. 76561199044933923

# Homelab
HOMELAB_STATUS_URL=      # your self-hosted /status endpoint

# GitHub (optional — raises rate limit from 60/hr to 5000/hr)
GITHUB_TOKEN=

# Dev only
HOMELAB_MOCK_DATA=true   # serve realistic mock telemetry without a real homelab
```

### 3. Run with Docker

```bash
docker compose up -d --build
```

### 4. Expose over Tailscale (free private HTTPS, no domain purchase)

```bash
tailscale serve https / http://localhost:3000
# → https://avn-hub.<your-tailnet>.ts.net on every device in your tailnet
```

That's it. No reverse proxy, no Let's Encrypt setup, no public DNS.

---

## Adding custom widgets

Adding widgets is the main extension path for AVN Hub. NutBot's `CREATOR` tab is the intended path for quick iteration: describe what you want, let it generate the widget, then place and resize it like anything else on the grid.

You can also follow [`docs/CREATING_WIDGETS.md`](docs/CREATING_WIDGETS.md) to write one by hand. The authoring guide is written so any developer or LLM can follow it literally.

Every widget is:

```text
components/widgets/custom/<slug>/
  <Name>Widget.tsx   ← React component (named export)
  manifest.json      ← metadata (title, icon, sizes, settings schema)
```

After a custom widget is registered, it appears in the Widget Manager and gets the same placement, resizing, settings, persistence, and optional HOE behavior as every bundled widget.

---

## Project structure

```text
app/
  page.tsx              # root — BootSequence + GlyphStrip + WallpaperLayer + SlotDashboard
  layout.tsx            # fonts, pre-paint theme/palette/backdrop script
  api/                  # proxy routes (Spotify, Steam, homelab, system-stats, GitHub, widget creator)
components/
  framework/            # widget shell, context, settings popover, error boundary
  widgets/default/      # built-in widgets (nutbot, now-playing, homelab, ambient, github…)
  widgets/custom/       # NutBot-generated custom widgets live here
  dashboard/            # SlotDashboard, HubCorePanel, LayoutProvider, CanvasSwitcher, WallpaperLayer
config/
  widgets.tsx           # manifest registry + DEFAULT_ORDER + FRAMEWORK_SETTINGS
  themes.ts             # palette metadata
  canvasIcons.ts        # curated icon set for canvas pills
  customRegistry.json   # auto-managed by widget creator
  customComponentMap.tsx
lib/
  slotLayout.ts         # slot layout store
  layout.ts             # widget instance types + graph layout store
  canvases.ts           # AVN Hub Canvases store + per-canvas key namespacing
  wallpaper.ts          # BG image/video + canvas/widget backdrop modes + parallax
  idb.ts                # generic IndexedDB blob store
  ambient.ts            # Ambient Sound synthesis presets + custom track storage
  systemStats.ts        # real host CPU/mem/disk/network via systeminformation
  usePolling.ts         # shared per-URL polling cache
  format.ts             # timeAgo, formatDuration, formatMins
  nutbotSignal.ts       # cross-component NutBot expression signalling
styles/
  globals.css           # design tokens, theme packs, grid, card CSS, backdrop modes
docs/
  CREATING_WIDGETS.md   # widget authoring guide
  AVN_HUB.md            # Hub Core / layout / theme / persistence reference
```

---

## Persistence

Layout and preference state lives in `localStorage`; wallpaper images/videos and uploaded ambient clips live in IndexedDB (too large for `localStorage`'s quota). No database needed either way.

| Key | Contents |
| --- | --- |
| `nutmag-canvases` | Canvas identities + active canvas |
| `nutmag-slot-layout` | Region dims + widget placements (per canvas) |
| `nutmag-theme` | Theme mode — light / auto / dark (per canvas) |
| `nutmag-palette` | Active colour palette (per canvas) |
| `nutmag-backdrop` / `nutmag-widget-backdrop` | Canvas / widget backdrop mode — solid / blur / transparent (per canvas) |
| `nutmag-parallax` | Mouse parallax on/off (per canvas) |
| `nutmag-prefs` | Polling on/off, boot sequence on/off |
| `nutmag-sessions` | Session uptime tracker |
| `nutmag-ambient-tracks` / `-selected` / `-volume` | Ambient Sound custom track registry + selection + volume |
| IndexedDB `nutmag-db` (`blobs` store) | Wallpaper images/videos, uploaded ambient clips |

Per-canvas keys use the bare name for the original/default canvas (no migration needed for existing users) and a `::<canvasId>` suffix for every canvas created after Canvases shipped.

---

## Tech stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS + CSS custom properties |
| Animations | Framer Motion |
| Drag & resize | dnd-kit + custom resize handles |
| System telemetry | `systeminformation` (real CPU/mem/disk/network) |
| NutBot face | SVG with RAF animation loop |
| Widget AI | Claude Code / OpenCode / Codex CLI |
| Deployment | Docker + Tailscale |
