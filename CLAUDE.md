# CLAUDE.md â€” AVN Hub

## What this is
A living personal dashboard for what I'm listening to, what game I'm playing, whether my homelab is alive, and what I'm currently building. Not a portfolio. Not a resume. A living dashboard.

---

## Stack
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS + custom CSS variables
- **Animations**: Framer Motion
- **Deployment**: Self-hosted Docker (runs on the homelab â€” thematically fitting since the card reports on the same infra it lives on). Accessed via **Tailscale** (MagicDNS hostname + `tailscale serve` for automatic HTTPS within the tailnet) â€” no public domain purchase, no separate reverse proxy/Let's Encrypt setup, fully free and private
- **Language**: TypeScript throughout

---

## Aesthetic â€” never deviate from this

> **Design system reference**: [`DESIGN_VARIATIONS.md`](./DESIGN_VARIATIONS.md) (full written spec) and [`DESIGN_VARIATIONS.html`](./DESIGN_VARIATIONS.html) (live mockup â€” open directly in a browser, no build step). The **"G â€” Chunky Blocks + Accent Border"** column, in both the Dark Mode and Light Mode sections, is the chosen direction.

**Direction**: "Chunky Blocks + Accent Border" â€” warm, dense, sticker/stamp-bordered cards. This deliberately replaces the earlier CRT/neon/terminal look. Both dark and light themes are first-class and fully designed; ship with a theme toggle.

| Token | Dark | Light |
|---|---|---|
| Page background | `#13100c` | `#d8cfbc` |
| Card/surface background | `#1e1a14` (`#1a1610` nested) | `#f5f0e6` (`#faf6f0` nested) |
| Border | `#3d3220` | `#7a6a52` |
| Sticker shadow | `#070604` | `#a89878` |
| Text primary | `#e8dfc8` | `#1c1810` |
| Text muted | `#9f9887` / `#8b8475` | `#9a8870` / `#b0a090` |
| Orange accent | `#ff6b2b` | `#e05a18` |
| Cyan/teal accent | `#00b4c8` | `#00768a` |

- **Layout**: A configurable dashboard grid inside the `.frame` bezel â€” every block (including the namecard and NutBot) is a widget placed by the widget framework (below). Global canvas settings live in Hub Core, outside the widget registry. No hardcoded composition; `DEFAULT_ORDER` in `config/widgets.tsx` is just the starting arrangement
- **Card treatment ("sticker/stamp")**: `border-radius: 12â€“16px`, `border: 1.5px solid` (border token), hard offset `box-shadow: 3-5px 3-5px 0` (shadow token, **no blur**)
- **Typography**: `DotGothic16` for the logo (`1.7rem`), section/field labels (`0.62rem`, uppercase, `letter-spacing: 0.14em`), and headline stat numbers (`2.2rem`, `line-height: 1` â€” the largest text on the page). `JetBrains Mono` for primary data values (`1.25rem`, `font-weight: 500`), sub text (`0.75rem`), and chips/pills/badges (`0.6â€“0.65rem`, uppercase)
- **Icons**: Lucide, 14Ã—14px, `stroke-width: 1.75`, prefixed to section labels, links, and badges
- **Motion**: Subtle data transitions and per-size content swaps. No scanlines, no grain, no phosphor glow.
- **Theme packs**: the token table above is the default **ember** palette. Alternate packs (slate, moss, plum, reef, raspberry, circuit, graphite â€” each with dark+light variants) live as `[data-palette="â€¦"]` blocks in `globals.css` with metadata in `config/themes.ts`; picked from Hub Core settings, persisted to `localStorage["nutmag-palette"]`, applied pre-paint by the inline script in `app/layout.tsx` and re-applied at runtime by `ThemeRuntimeSync`. New packs must define the full 14-token set for both modes and respect every other rule in this section
- **Never use**: Inter, Roboto, Arial, system fonts, purple gradients, centered portfolio layouts, pure black/white, neon glow, CRT scanlines/grain, blurred shadows
- **Wallpaper + backdrop modes** (`lib/wallpaper.ts`): three stacked layers — **BG** (an optional per-canvas wallpaper image, stored in IndexedDB via `lib/idb.ts`'s generic blob store, rendered by `WallpaperLayer`; has no mode of its own), **canvas** (`.frame`, the bezel holding the grid), **widgets** (`.block`). Canvas and widgets each get their own independent solid/blur/transparent dial in Hub Core's Appearance settings (`data-backdrop` / `data-widget-backdrop` on `<html>`) — the widget dial is a *global default* every widget inherits via "auto", separate from each widget's own per-instance override in its gear popover; it does not cascade from the canvas dial. `blur` uses `backdrop-filter: blur()` for frosted-glass translucency over BG — a distinct, deliberate exception from the "blurred shadows" rule above, which still refers only to `box-shadow` (sticker shadows stay hard-offset, zero-blur, unchanged)

---

## Widget Framework â€” how everything on the page is built

> **Authoring guide**: [`docs/CREATING_WIDGETS.md`](./docs/CREATING_WIDGETS.md) is the step-by-step spec for adding a widget â€” written so any developer or LLM can follow it literally. Keep it in sync with this section.

A widget = **one content component + one manifest entry** in `config/widgets.tsx`. The framework supplies everything else: card chrome, label header, grid placement, polling, settings UI, persistence. Never hand-roll `.block` markup or fetch loops inside a widget.

**Interaction model**: widgets are **resizable** (S/M/L Ã— h/v) and **rearrangeable** (drag in edit mode); a widget shows more when bigger by **rendering different markup per size**. Slot Layout also supports opt-in **Hover On Expand** as a transient visual preview: when the widget's `slot hover expand` setting is enabled, the hovered widget gets a real larger preview box, and only directly edge-touching neighbors get smaller preview boxes. It does not persist layout, change the stored widget size, open an overlay, or cascade into neighbors-of-neighbors. A prior hover/click/grow-expansion subsystem (flyout/overlay) was removed because it caused a hover-oscillation loop â€” framer-motion `layout` and dnd-kit's `animateLayoutChanges` both re-measure + setState per item after a reflow, and dense grid flow moves *every* item, so either one loops into "Maximum update depth exceeded". Any future hover/expand work must keep those guardrails: no layout-animation systems on grid items, and no state changes triggered from hover/measurement callbacks that themselves cause a reflow.

**Manifest (`WidgetManifest`)**: `{ id, title, icon, component, detail?, sizes, orientations, defaults, settings?, flags? }`. `id` is the unique key (also the persistence key + card DOM id). `detail?` is a component the shell auto-renders below the main content **at L size only** (the low-effort path to a rich large layout). Flags: `plainChrome` (no card chrome â€” identity), `customHeader` (chrome but widget renders its own header â€” github, steam), `accent` (orange left border), `className` (extra class on `.block`).

**Adding a widget**: write the content component (data + markup only, no shell), optionally a `detail` component, register a manifest, append the id to `DEFAULT_ORDER`. Done â€” it's draggable, resizable, hideable, and configurable automatically.

**Inside a widget**:
- `useWidget()` (`components/framework/WidgetContext.tsx`) â†’ `{ id, size, orientation, settings }` â€” **branch on `size` for distinct S/M/L layouts** (the core customization lever)
- `usePolling<T>(url, intervalMs)` (`lib/usePolling.ts`) â†’ shared per-URL cache + timer; honors the global polling pref; never commits non-OK responses
- shared formatters in `lib/format.ts` (`timeAgo`, `formatDuration`, `formatMins`)

**Per-size UI**: the shell sets `data-size="S|M|L"` on the `.capsule` (CSS hook). Components either branch on `useWidget().size` (full control â€” `NowPlaying`, `CurrentlyPlaying`, and `NutBotFaceWidget` which renders the **terminal** at L) or declare a `detail` component (auto-rendered at L inside `.size-l-more` â€” homelab, jellyfin, arr-stack, github, â€¦). Either way a widget with L-only content **must include `"L"` in `sizes`**.

**Grid engine** (`components/Dashboard.tsx` + `.widget-grid` in `globals.css`): CSS grid, 6 columns at full width (4 â‰¤1440px, 2 â‰¤1023px, 1 â‰¤640px â€” mirrored in `lib/useGridColumns.ts`), `grid-auto-flow: row dense`, rows `minmax(128px, auto)` so content can never clip. `SPAN_MAP` converts sizeÃ—orientation presets to spans: S-h 1Ã—1 Â· S-v 1Ã—2 Â· M-h 2Ã—1 Â· M-v 2Ã—2 Â· L-h 3Ã—2 Â· L-v 2Ã—3. Drag/drop is dnd-kit over the flat instance list (no transform strategy â€” live reorder in `onDragOver` reflows the real grid; a `DragOverlay` carries the visual). **Never attach layout-animation systems to the grid items**: framer-motion `layout` and dnd-kit's `animateLayoutChanges` both re-measure + setState per item after a reflow, and dense flow moves *every* item, so either one loops into "Maximum update depth exceeded" (this is why `useSortable` passes `animateLayoutChanges: () => false`).

**Per-widget config**: edit mode (wrench toggle) shows a drag handle + gear per card; the gear opens `WidgetSettingsPopover` â€” placement controls (size/shape/hide, limited to what the manifest supports, Graph Layout only), framework interaction settings such as Slot Layout's `slot hover expand`, plus a form auto-generated from the manifest's `settings` schema (`toggle | select | text | number`).

**Persistence** (`lib/layout.ts`): legacy `localStorage["nutmag-layout"]` v2 â€” `{ version: 2, widgets: WidgetInstance[] }` where order = grid order and each instance carries `size/orientation/hidden/settings`. Every mutation persists immediately. `sanitize()` migrates v1 column layouts (pair ids `media`/`disk-network` expand to their member widgets), clamps values to manifest capabilities, drops unknown ids/settings, and re-appends missing widgets so nothing can disappear. Other legacy compatibility keys: `nutmag-theme`, `nutmag-palette`, `nutmag-prefs` (`lib/prefs.ts`: polling on/off, boot sequence on/off), `nutmag-sessions` (`lib/sessions.ts`).

**AVN Hub Canvases** (`lib/canvases.ts`, `components/dashboard/CanvasSwitcher.tsx`): Arc-spaces-style named layouts — one canvas per context (e.g. home / work / entertainment). Rendered as a vertical pill stack on the right edge, attached to `HubCorePanel`'s `.hub-core.hub-core-slot` column directly below the wrench/settings/widgets buttons (same edge dock, separated by `.hub-core-divider`) â€” not a separate UI surface. Every button in that column, canvases included, is icon/glyph-only at rest and grows taller on hover/focus to reveal a vertical (`writing-mode: vertical-rl`) text label, animated via `transition: height`; the canvas pill list itself collapses behind a chevron toggle (`CanvasSwitcher`'s local `collapsed` state) to save edge space. Double-click a pill to open a rename/delete flyout (`.canvas-manage-panel`, opens to the left, reuses the single shared `activePopover` from `LayoutProvider`). Canvas identity (`{ id, name, icon? }` list + `activeId`) persists to `localStorage["nutmag-canvases"]`; `icon` is optional, one of `config/canvasIcons.ts`'s curated Lucide set (`CanvasIconPicker` for picking one, `CanvasGlyph` for rendering it or falling back to the first-letter-of-name glyph). Both the widget arrangement (`lib/slotLayout.ts`) and theme mode + palette (`lib/theme.ts`) are per-canvas, namespaced via `canvasScopedKey(baseKey, canvasId)` (the bare key for the original `default` canvas — no migration needed for existing users; `<key>::<id>` for every canvas created afterward). New canvases start with an empty layout and the hardcoded theme defaults, not a clone of `default`. Both `slotLayout.ts` and `theme.ts` independently `subscribeCanvases()` at module load and re-apply/notify their own listeners on an actual id change, so neither module — nor `CanvasSwitcher` itself — needs to know about the other; `app/layout.tsx`'s pre-paint script duplicates the same `canvasScopedKey` logic inline (can't import TS there) to avoid a flash of the wrong canvas's theme. Deleting a canvas removes its slot-layout/theme/palette keys too; the last remaining canvas can't be deleted. Management UI exists in two places sharing the same mutators (`lib/canvases.ts`): a double-click flyout on the edge pill itself (`.canvas-manage-panel`, opens to the left, reuses the single shared `activePopover` from `LayoutProvider`), and a dedicated "canvases" accordion section in Hub Core Settings (`CanvasesSettings`/`CanvasSettingsRow`) for full at-a-glance rename/icon/delete/add. Note: `.canvas-pill-list` deliberately has no `overflow: hidden` (it would clip the flyout, which is an absolutely-positioned descendant escaping to the left) — see the comment in `globals.css`.

**Widget controls** (Hub Core Widget Manager tab): the single surface for adding/removing widgets, opened from its own Hub Core tab rather than inside the AVN Hub canvas settings. In Graph Layout it lists on-screen widgets (removable â†’ `hidden: true`) and available/hidden ones (add-able â†’ `hidden: false`). In Slot Layout it lists placed/unplaced widgets and the add action expands into only the regions (`left`, `right`, `base`) that currently have room for that widget's footprint. Any registered widget appears automatically.

**Hub Core canvas settings**: theme, palette, global prefs, layout reset, region grid-size controls, and layout import/export live in the Hub Core settings tab. Settings sections are an accordion — opening one closes whichever was open (`openSection: CanvasSettingsSection | null` in `HubCorePanel`), not independently collapsible. Edit mode is controlled only by the persistent wrench/lock tab, not by duplicated controls inside the settings panel.

---

## Modules

### 1. Identity Block
- Display name, tagline, and initials are configurable in the widget settings.
- Links: GitHub, homelab status
- Quicklinks: extensible row of icon links (`/config/links.ts`) â€” currently YouTube, LinkedIn, ChatGPT
- Mark: compact identity mark with icon and configurable initials inside the card

### 2. Now Playing ðŸŽµ
- Source: Spotify Web API (Authorization Code flow)
- Shows: track name, artist, album art (blurred as background accent)
- Live: animated equalizer bars when track is playing
- Fallback: last played track + "X minutes ago" timestamp
- Env var: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`

### 3. Currently Playing ðŸŽ®
- Source: Steam API (public profile)
- Shows: game name, hours this session, total hours
- Fallback: last played game + time since
- Env var: `STEAM_API_KEY`, `STEAM_PROFILE_ID`

### 4. Homelab Status ðŸ–¥ï¸
- Source: self-hosted `/status` endpoint on homelab server
- Shows: row of service dots (green = up, red = down) + average uptime %
- Cached every 60s â€” do not hammer the endpoint
- Env var: `HOMELAB_STATUS_URL`
- Real services: immich, jellyfin, jellyseerr, radarr, sonarr, jackett, qbittorrent, nextcloud
- Expected response shape (v1, current):
```json
{
  "services": [
    { "name": "immich", "status": "up", "uptime": "99.9%" },
    { "name": "jellyfin", "status": "up", "uptime": "99.8%" }
  ],
  "last_checked": "2026-06-08T14:32:00Z"
}
```
- **v2 (design-only, see `lib/homelab.ts`)**: per-service `telemetry` â€” storage for Immich/Nextcloud, download queues for Sonarr/Radarr/qBittorrent, request queue for Jellyseerr, media sessions for Jellyfin. The aggregator that produces this per-service telemetry is a separate homelab-side project, not yet built, so `ArrStack`/`StorageApps`/`Jellyfin` stay on `HOMELAB_MOCK_DATA`/`HOMELAB_STATUS_URL` mock data for now.
- **Host telemetry (System Stats / Disk Storage / Network Stats widgets) is real, not mocked** â€” `lib/systemStats.ts` reads live CPU/memory/disk/network straight off the machine the Next.js server process is actually running on, via the `systeminformation` package (Node has no built-in cross-platform way to get disk usage or network throughput). Served via `/api/system-stats`, polled every 60s, 10s server-side cache. Deliberately a different machine/concept from the mocked per-service homelab telemetry above â€” this is "the box AVN Hub itself runs on," not "the homelab's other services." `getServerStats()`'s drive list filters out macOS's internal `/System/Volumes/*` and `/private/*` mounts (APFS implementation detail, not real user-facing drives); no-op on Linux. Widget title reads "system stats" (not "server") â€” the manifest id stays `server-stats` since it's a persistence key.

### 5. GitHub Activity
- Source: GitHub public events API (`/users/Zohaib2244/events/public`), filtered to push commits
- Shows: most recent commit message + repo + relative time â€” standalone hero block with the orange-accent left border
- More-info panel: next several recent commits (message Â· repo Â· relative time)
- Env var (optional): `GITHUB_TOKEN` â€” raises rate limit from 60/hr to 5000/hr; works unauthenticated too

### 6. Ambient Sound
- Built-in presets (rain, wind, drone, room tone) are synthesized live via the Web Audio API in `lib/ambient.ts` â€” no bundled audio assets, same idea as Diss Glade's oscillator-based song
- User-uploaded custom clips are stored as raw `Blob`s in IndexedDB via `lib/idb.ts`'s generic blob store, with a small `{id, name}` registry in `localStorage["nutmag-ambient-tracks"]`
- Play/pause, volume, and a real-time bar visualizer (`AnalyserNode` + direct DOM mutation per frame, not React state, so the animation never re-renders)
- Global, not per-canvas â€” it's a personal-mood setting, not tied to a canvas's layout or theme
- L size adds the full track list with upload/delete; S/M show progressively less

---

## Project Structure
```
/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ page.tsx              # BootSequence + GlyphStrip + LayoutProvider/Dashboard
â”‚   â”œâ”€â”€ layout.tsx            # Root layout, fonts, pre-paint theme/palette script
â”‚   â””â”€â”€ api/                  # Proxy routes (hide all API keys)
â”‚       â”œâ”€â”€ now-playing/  currently-playing/  steam-library/  spotify-control/
â”‚       â”œâ”€â”€ homelab/  homelab-v2/  system-stats/  uptime/
â”‚       â”œâ”€â”€ github-activity/  github-repos/
â”‚       â””â”€â”€ widget-creator/   # generate/edit/delete/export/import/harnesses
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ framework/            # THE widget framework â€” touch with care
â”‚   â”‚   â”œâ”€â”€ WidgetShell.tsx   # card chrome + label + detail-at-L (no expansion)
â”‚   â”‚   â”œâ”€â”€ WidgetContext.tsx # useWidget() â€” { id, size, orientation, settings }
â”‚   â”‚   â””â”€â”€ WidgetSettingsPopover.tsx  # gear popover (placement + schema form)
â”‚   â”œâ”€â”€ widgets/default/      # built-in widgets, one subfolder per module
â”‚   â”‚   â””â”€â”€ ambient/AmbientSoundWidget.tsx
â”‚   â”œâ”€â”€ dashboard/
â”‚   â”‚   â”œâ”€â”€ SlotDashboard.tsx     # Slot Layout grid + dnd-kit + edit mode
â”‚   â”‚   â”œâ”€â”€ LayoutProvider.tsx    # layout store context (instances, editMode)
â”‚   â”‚   â”œâ”€â”€ HubCorePanel.tsx      # settings/widget-manager edge tabs
â”‚   â”‚   â”œâ”€â”€ CanvasSwitcher.tsx    # AVN Hub Canvases edge pill stack
â”‚   â”‚   â””â”€â”€ WallpaperLayer.tsx    # BG image/video layer + mouse parallax
â”‚   â”œâ”€â”€ NutBotTerminal.tsx    # tabs (log/real shells/creator)/xterm â€” rendered by nutbot at L
â”‚   â””â”€â”€ *.tsx                 # widget content components (no shell markup)
â”œâ”€â”€ config/
â”‚   â”œâ”€â”€ widgets.tsx           # WIDGETS manifest registry + SPAN_MAP + DEFAULT_ORDER
â”‚   â”œâ”€â”€ themes.ts             # theme pack metadata (tokens live in globals.css)
â”‚   â”œâ”€â”€ canvasIcons.ts        # curated Lucide set for canvas pill icons
â”‚   â””â”€â”€ links.ts              # Identity block quicklinks (extensible)
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ layout.ts             # layout store v2 (instances, sanitize, v1 migration)
â”‚   â”œâ”€â”€ slotLayout.ts         # Slot Layout region/placement store
â”‚   â”œâ”€â”€ canvases.ts           # AVN Hub Canvases store + canvasScopedKey()
â”‚   â”œâ”€â”€ theme.ts              # mode (light/auto/dark) + palette stores, per-canvas
â”‚   â”œâ”€â”€ wallpaper.ts          # BG image/video + canvas/widget backdrop modes + parallax, per-canvas
â”‚   â”œâ”€â”€ idb.ts                # generic IndexedDB key/value blob store (wallpaper, ambient tracks, future)
â”‚   â”œâ”€â”€ ambient.ts            # Ambient Sound presets (Web Audio synthesis) + custom track storage
â”‚   â”œâ”€â”€ systemStats.ts        # real host CPU/mem/disk/network via `systeminformation`
â”‚   â”œâ”€â”€ prefs.ts              # global prefs store (polling, boot sequence)
â”‚   â”œâ”€â”€ usePolling.ts         # shared per-URL polling cache
â”‚   â”œâ”€â”€ useGridColumns.ts     # breakpoint â†’ grid column count
â”‚   â”œâ”€â”€ format.ts             # timeAgo / formatDuration / formatMins
â”‚   â”œâ”€â”€ sessions.ts           # session tracker store
â”‚   â””â”€â”€ spotify.ts  steam.ts  github.ts  homelab.ts   # server-side API clients
â”œâ”€â”€ styles/
â”‚   â””â”€â”€ globals.css           # tokens (+ theme packs), grid, card/per-size CSS, backdrop modes
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ CREATING_WIDGETS.md   # widget authoring guide (humans + LLMs)
â”‚   â””â”€â”€ AVN_HUB.md            # Hub Core / layout / theme / persistence reference
â”œâ”€â”€ CLAUDE.md                 # This file
â””â”€â”€ .env.local                # All API keys â€” never commit this
```

---

## API Routes â€” always proxy, never expose keys client-side

All external API calls go through `/app/api/` routes. The client only ever calls internal Next.js endpoints. Never put API keys in client components.

Polling interval: 30s for Now Playing, 60s for everything else.

---

## Current Focus
> **MVP â€” get data flowing before touching UI** (âœ… shipped)
> 1. Set up Next.js project, Tailwind, Framer Motion
> 2. Build Spotify API route + NowPlaying component (data only, unstyled)
> 3. Build Steam API route + CurrentlyPlaying component (data only, unstyled)
> 4. Build homelab status endpoint on server + proxy route
> 5. Wire up all data, confirm everything returns correctly
> 6. Apply full aesthetic per the Design System (Chunky Blocks + Accent Border, dark/light tokens, hover-to-expand capsules) â€” see `DESIGN_VARIATIONS.md`/`.html`
> 7. Deploy via Docker + Tailscale (see Phase 8 below)

> **Widget framework refactor** (âœ… shipped â€” see "Widget Framework" section)
> - Manifest-driven widget registry; shell owns chrome/settings; shared `usePolling`/`format` plumbing
> - Configurable grid (size/orientation presets â†’ spans, dense auto-flow) replacing the fixed 4-column layout; dnd-kit drag everywhere
> - Per-widget config (size, shape, hide, schema-driven settings) editable from the site, persisted to localStorage (v1 layouts migrate automatically)

> **Expansion removed â†’ safe visual HOE model** (âœ… shipped)
> - Ripped out all widget expansion (hover/grow/overlay): deleted `gridCascade.ts`, `WidgetFlyout`/`WidgetOverlay`/`MicroView`, the cascade/override/view-transition machinery, and the `expand`/`expandDirection`/`expandModes`/`expandedComponent` fields. (The hover system caused a reflow-oscillation loop.)
> - Widgets are **resize + rearrange** at the layout level; "more when bigger" is per-size markup (`useWidget().size`) or a manifest `detail` component rendered at L
> - Slot Layout has an opt-in visual-only **Hover On Expand** preview driven by `lib/grid/hoverExpand.ts`, `SlotRegion`, and `SlotWidgetCell`: real transient preview boxes, no persisted hover mutation, no overlays, no neighbor cascade
> - Widget add/remove moved into the Hub Core Widget Manager tab; NutBot renders its terminal at L; canvas appearance/prefs/reset controls live in Hub Core settings
> - Authoring guide written: [`docs/CREATING_WIDGETS.md`](./docs/CREATING_WIDGETS.md)

> **NutBot widget-creator chat** (âœ… shipped)
> - In-UI chat (NutBot's `CREATOR` tab) that scaffolds new widgets on request, backed by a choice of CLI harness â€” `claude`, `codex`, or `opencode` (`lib/widget-creator/harnessAdapters.ts`), with auto-fallback if one hits a rate limit. Generates the content component + manifest entry, TypeScript-checks before registering, rolls back on failure. Follows `docs/CREATING_WIDGETS.md` as its own prompt context, so that doc stays authoritative for both humans and the LLM.
> - Harness availability (`/api/widget-creator/harnesses`) is checked by actually spawning `<command> --version` rather than shelling out to `which`/`where` â€” `which` doesn't exist on Windows at all, and even on Unix it bypassed the same Windows-shim resolution (`shell: true`) the real generation spawn already needed.

> **AVN Hub Canvases** (âœ… shipped â€” see "AVN Hub Canvases" under Widget Framework above)

> **Personalization layer** (âœ… shipped)
> - Per-canvas wallpaper (image or short looping video, stored in IndexedDB) + independent canvas/widget backdrop modes (solid/blur/transparent) + opt-in mouse parallax â€” see `lib/wallpaper.ts`
> - Ambient Sound widget â€” synthesized presets + user-uploaded clips, real-time visualizer â€” see `lib/ambient.ts`

> **Wallpaper Engine build** (âœ… shipped)
> - A second, separate Next.js app at [`wallpaper/`](./wallpaper/) â€” own `package.json`/`next.config.ts` (`output: "export"`, `turbopack.root` pinned one level up so it can still resolve `@/components`/`@/lib`/`@/config` from the main project) â€” builds AVN Hub into a static, serverless bundle for use as a [Wallpaper Engine](https://www.wallpaperengine.io/) "Web" wallpaper. `npm run build` in `wallpaper/` produces `out/`, dropped into Wallpaper Engine via its own `project.json`. See [`wallpaper/README.md`](./wallpaper/README.md).
> - Deliberately not the Slot Layout dashboard: no edit mode, no drag/resize, no Hub Core panel, no per-widget gear settings, no `app/api/*` at all â€” every widget that needs a server or a secret (Spotify/Steam/GitHub, System Stats/Disk/Network, the homelab v2 widgets, NutBot's real shell/chat/creator) is dropped entirely rather than shipping keys in a wallpaper file on disk. NutBot becomes a plain idle mascot (`NutBotMascot.tsx` â€” just `NutBotFaceV2`, no terminal import at all).
> - New widgets unique to this build, all in `components/widgets/default/audio/`, built on `lib/wallpaperEngineBridge.ts`'s typed wrapper around the globals Wallpaper Engine injects (confirmed against docs.wallpaperengine.io, not assumed): **Audio Pulse** + **Audio Visualizer** react to system-wide audio via `wallpaperRegisterAudioListener`; **Media Now Playing** reads Windows' OS-level Global Media Session via WE's media-integration listeners â€” a strictly better "now playing" than the Spotify widget for this context, since it works with anything playing on the system and needs zero API keys. `setPaused` (fires when WE reports the wallpaper isn't visible, e.g. a fullscreen app has focus) gates these widgets' animation loops via `useWallpaperPaused()`. Every bridge subscription no-ops safely when `window.wallpaperPropertyListener` doesn't exist, so the same build renders its idle/fallback state in a normal browser tab (no Wallpaper Engine installed) instead of throwing.
> - Exactly three controls stay clickable directly on the desktop (everything else is read-only display): theme mode (already built into `ClockWidget`), the canvas pill row (inlined in `WallpaperDashboard.tsx`, deliberately not importing `CanvasSwitcher.tsx` to avoid dragging in its `LayoutProvider` dependency for no reason), and Ambient Sound's own play/pause. `project.json`'s one custom WE property (a palette combo, rendered in Wallpaper Engine's own settings panel) is wired end-to-end to the same `setPalette()` the in-app theme settings use.
> - `UptimeMilestonesStatic.tsx` and the identity card's uptime stat both lose their `/api/uptime` dependency in this build (no server) â€” the milestone day counter never needed it (just `Date.now()` vs a fixed epoch); the "session" line measures time since the wallpaper itself loaded instead. The identity card's small uptime stat isn't forked and just shows "â€”" gracefully (same `fetch` failure path that already existed for an unreachable server), consistent with Wallpaper Engine's own guidance that a wallpaper "shouldn't break if the server isn't reachable."

> **Now â€” content finalization & v2 modules**
> - Host telemetry (System Stats / Disk Storage / Network Stats) is now real, not mock â€” see Module 4. The per-service v2 telemetry (Immich/Nextcloud storage, Sonarr/Radarr/qBittorrent queues, Jellyseerr requests, Jellyfin sessions) still needs the separate homelab-side aggregator project; those widgets stay on mock data until it ships.
> - Personal uptime stat â€” switch from fixed "days since project epoch" to live session uptime (resets on server restart), plus a future DB-backed historical tracker
> - Grid default-layout tuning (span presets per widget) after living with the new arrangement

---

## Environment Variables Needed
```
SPOTIFY_CLIENT_ID=      # optional now â€” the Now Playing widget can also take these
SPOTIFY_CLIENT_SECRET=  # in its gear settings (per-widget). Env vars are the
SPOTIFY_REFRESH_TOKEN=  # fallback used when a settings field is left blank.
STEAM_API_KEY=          # optional â€” Currently Playing widget settings can supply these
STEAM_PROFILE_ID=76561199044933923
HOMELAB_STATUS_URL=
GITHUB_TOKEN=           # optional â€” GitHub widget settings can supply username + token
HOMELAB_MOCK_DATA=      # optional, dev-only â€” "true" serves realistic mock v2 telemetry
                        # (CPU/Mem/disks/network + all 8 services) instead of HOMELAB_STATUS_URL,
                        # for testing the new capsules on machines without homelab access
NUTBOT_SHELL_DISABLED=  # optional â€” set "true" to disable NutBot's integrated real
                        # shell route (/api/nutbot-shell). The shell is ON by default
                        # and gives anyone who can reach the UI a real shell on the host
                        # as the server's user â€” intended for the single-user/self-hosted
                        # /full-trust model. Disable it if you expose the hub more widely.
```

**Credentials in widget settings:** the Spotify / Steam / GitHub widgets each expose their credentials as fields in the gear/settings popover (Spotify uses a masked `password` field type for the secret + refresh token; Steam for the api key; GitHub for the token). Values are stored client-side in the layout and POSTed to that widget's own API route, which falls back to the `*_*` env vars above when a field is blank â€” so existing `.env.local` setups keep working unchanged, and per-widget settings override them. Lib clients (`lib/spotify.ts`/`steam.ts`/`github.ts`) take an optional creds arg and key their module caches by it so switching accounts refetches.

## Deploy â€” Docker + Tailscale

**Runtime model (as of v2.1):** AVN Hub runs the Next.js **dev server** (`next dev`, Turbopack) as its actual runtime â€” *not* a `next build`/`next start` standalone image. The widget creator writes real `.tsx` into the source tree at runtime and depends on the dev server's file-watcher/HMR (load a new widget with no rebuild), the TS toolchain (`tsc` validation), the full source tree, and an agent CLI being present. A slim prod build has none of those and would break the headline feature. This is safe because AVN Hub is single-user/self-hosted/full-trust â€” the "never run next dev in prod" rule is a multi-tenant perf+security rule that doesn't bind here. The `Dockerfile` runs `npm run dev`; `docker-compose.yml` bind-mounts the project so agent-written widgets persist to the host (with an anonymous `node_modules` volume so native bindings aren't shadowed). The agent CLI (`claude`/`codex`/`opencode`) must be available wherever the server runs â€” inside the container, or just run the hub directly on a host that already has it (`npm run dev`).

```bash
# Option A (recommended) â€” directly on a host that has your agent CLI:
npm install && npm run dev

# Option B â€” Docker (CLI must be available inside the container):
docker compose up -d --build

# Expose over Tailscale HTTPS (no domain, no cert config needed):
tailscale serve https / http://localhost:3000
# â†’ reachable at https://avn-hub.<tailnet>.ts.net from any tailnet device
```

Secrets are passed at runtime via `env_file: .env.local` â€” they are never baked into the image layer.

## Versioning & changelog

Track every notable change in [`CHANGELOG.md`](./CHANGELOG.md) (Keep a Changelog format). Add entries under `## [Unreleased]` (grouped Added / Changed / Fixed / Removed) as you work. On a release, rename `Unreleased` to the version + date and bump **all three** version markers together: `version` in `package.json`, the `v2.x` string in `components/dashboard/BootSequence.tsx`, and the changelog. Current version: **2.1.0**.

---

## Still to Confirm (fill these in before starting)
- [x] Steam profile ID + confirm profile is public â€” `76561199044933923`, confirmed public
- [x] Homelab services â€” real list: immich, jellyfin, jellyseerr, radarr, sonarr, jackett, qbittorrent, nextcloud
- [x] Domain for deployment â€” **No purchase needed**: serving over Tailscale instead (MagicDNS hostname / `tailscale serve` for HTTPS within the tailnet). Keeps the whole stack free and private; `tailscale funnel` remains an option later if public access is ever wanted
- [x] Vercel or self-hosted Docker? â€” **Self-hosted Docker**
- [x] Custom logo file ready or generate one? â€” **Generic identity mark**: icon plus configurable initials inside the Identity widget

---

## Retro Polish & Interaction Ideas (weave in during the aesthetic pass â€” step 6 â€” or just after)
> Written under the old CRT aesthetic â€” re-check each against the Design System before implementing. The widget interaction model is **resize + rearrange**, plus Slot Layout's opt-in visual-only Hover On Expand; richer detail surfaces still come via per-size layouts (see Widget Framework).
- **Boot sequence intro**: brief retro-terminal "boot log" animation (dot-matrix text scrolling system checks) on first load, before the card resolves
- **Glyph-style status pulse**: thin strip of light (orange/cyan/cream) that pulses based on overall state â€” steady glow when everything's up, irregular flicker if a homelab service is down (Nothing Phone Glyph-inspired)
- **Personal uptime stat**: live server-process uptime ("Xh Ym running this session" â€” resets on restart), shown in the namecard. Future: a small DB-backed history service tracks uptime over time for a calendar/heatmap view in Homelab's more-info panel

---

## Post-MVP Backlog (do not build until MVP ships)
- Shareable PNG snapshot of the card
- Visitor counter (monospace, bottom corner)
- Mobile stacked layout
- Konami code easter egg
- AI-generated daily tagline via Claude API
- Light/dark theme toggle â€” both fully designed (see Aesthetic section / `DESIGN_VARIATIONS.html`); wire up once core data flow ships
