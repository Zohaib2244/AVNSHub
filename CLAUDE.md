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

**Widget controls** (Hub Core Widget Manager tab): the single surface for adding/removing widgets, opened from its own Hub Core tab rather than inside the AVN Hub canvas settings. In Graph Layout it lists on-screen widgets (removable â†’ `hidden: true`) and available/hidden ones (add-able â†’ `hidden: false`). In Slot Layout it lists placed/unplaced widgets and the add action expands into only the regions (`left`, `right`, `base`) that currently have room for that widget's footprint. Any registered widget appears automatically.

**Hub Core canvas settings**: theme, palette, global prefs, layout reset, region grid-size controls, and layout import/export live in the Hub Core settings tab. Settings sections are independently collapsible; multiple sections may remain open at once. Edit mode is controlled only by the persistent wrench/lock tab, not by duplicated controls inside the settings panel.

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
- **v2 (design-only, see `lib/homelab.ts`)**: per-service `telemetry` â€” storage for Immich/Nextcloud, download queues for Sonarr/Radarr/qBittorrent, request queue for Jellyseerr, media sessions for Jellyfin â€” plus a top-level `host` block with connected drives/disks (capacity used/total) and container network rx/tx stats. The aggregator that produces this is a separate homelab-side project, not yet built.

### 5. GitHub Activity
- Source: GitHub public events API (`/users/Zohaib2244/events/public`), filtered to push commits
- Shows: most recent commit message + repo + relative time â€” standalone hero block with the orange-accent left border
- More-info panel: next several recent commits (message Â· repo Â· relative time)
- Env var (optional): `GITHUB_TOKEN` â€” raises rate limit from 60/hr to 5000/hr; works unauthenticated too

---

## Project Structure
```
/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ page.tsx              # BootSequence + GlyphStrip + LayoutProvider/Dashboard
â”‚   â”œâ”€â”€ layout.tsx            # Root layout, fonts, pre-paint theme/palette script
â”‚   â””â”€â”€ api/                  # Proxy routes (hide all API keys)
â”‚       â”œâ”€â”€ now-playing/  currently-playing/  steam-library/  spotify-control/
â”‚       â”œâ”€â”€ homelab/  homelab-v2/  uptime/
â”‚       â””â”€â”€ github-activity/  github-repos/
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ framework/            # THE widget framework â€” touch with care
â”‚   â”‚   â”œâ”€â”€ WidgetShell.tsx   # card chrome + label + detail-at-L (no expansion)
â”‚   â”‚   â”œâ”€â”€ WidgetContext.tsx # useWidget() â€” { id, size, orientation, settings }
â”‚   â”‚   â””â”€â”€ WidgetSettingsPopover.tsx  # gear popover (placement + schema form)
â”‚   â”œâ”€â”€ widgets/
â”‚   â”‚   â””â”€â”€ NutBotFaceWidget.tsx  # face at S/M, terminal at L
â”‚   â”œâ”€â”€ Dashboard.tsx         # grid + dnd-kit drag/drop + edit mode
â”‚   â”œâ”€â”€ LayoutProvider.tsx    # layout store context (instances, editMode)
â”‚   â”œâ”€â”€ NutBotTerminal.tsx    # tabs/mock shells/xterm â€” rendered by nutbot at L
â”‚   â””â”€â”€ *.tsx                 # widget content components (no shell markup)
â”œâ”€â”€ config/
â”‚   â”œâ”€â”€ widgets.tsx           # WIDGETS manifest registry + SPAN_MAP + DEFAULT_ORDER
â”‚   â”œâ”€â”€ themes.ts             # theme pack metadata (tokens live in globals.css)
â”‚   â””â”€â”€ links.ts              # Identity block quicklinks (extensible)
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ layout.ts             # layout store v2 (instances, sanitize, v1 migration)
â”‚   â”œâ”€â”€ theme.ts              # mode (light/auto/dark) + palette stores
â”‚   â”œâ”€â”€ prefs.ts              # global prefs store (polling, boot sequence)
â”‚   â”œâ”€â”€ usePolling.ts         # shared per-URL polling cache
â”‚   â”œâ”€â”€ useGridColumns.ts     # breakpoint â†’ grid column count
â”‚   â”œâ”€â”€ format.ts             # timeAgo / formatDuration / formatMins
â”‚   â”œâ”€â”€ sessions.ts           # session tracker store
â”‚   â””â”€â”€ spotify.ts  steam.ts  github.ts  homelab.ts   # server-side API clients
â”œâ”€â”€ styles/
â”‚   â””â”€â”€ globals.css           # tokens (+ theme packs), grid, card/per-size CSS
â”œâ”€â”€ docs/
â”‚   â””â”€â”€ CREATING_WIDGETS.md   # widget authoring guide (humans + LLMs)
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

> **Next â€” widget-creator chat (planned)**
> - An in-UI chat widget backed by an LLM (likely Claude CLI) whose sole job is to scaffold new widgets into this ecosystem on request ("make me an X widget"). It should follow `docs/CREATING_WIDGETS.md` exactly: generate the content component + manifest entry + `DEFAULT_ORDER` line. Keep that doc authoritative and machine-followable so this is a thin wrapper.

> **Now â€” content finalization & v2 modules**
> - Homelab v2 host telemetry (drives, network) â€” types defined in `lib/homelab.ts`; aggregator still to build on the homelab side
> - Personal uptime stat â€” switch from fixed "days since project epoch" to live session uptime (resets on server restart), plus a future DB-backed historical tracker
> - Grid default-layout tuning (span presets per widget) after living with the new arrangement

---

## Environment Variables Needed
```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
STEAM_API_KEY=
STEAM_PROFILE_ID=76561199044933923
HOMELAB_STATUS_URL=
GITHUB_TOKEN=           # optional
HOMELAB_MOCK_DATA=      # optional, dev-only â€” "true" serves realistic mock v2 telemetry
                        # (CPU/Mem/disks/network + all 8 services) instead of HOMELAB_STATUS_URL,
                        # for testing the new capsules on machines without homelab access
NEXT_PUBLIC_NUTBOT_SHELL_URL=  # optional, dev-only â€” set to ws://localhost:4001 (with
                        # `npm run nutbot:shell` running) to add a "real shell" tab to NutBot,
                        # backed by an actual pty on this machine. NEVER set in a
                        # deployed/Tailscale-exposed build
```

## Deploy â€” Docker + Tailscale

```bash
# On the homelab machine, in this repo:
docker compose up -d --build

# Expose over Tailscale HTTPS (no domain, no cert config needed):
tailscale serve https / http://localhost:3000
# â†’ reachable at https://avn-hub.<tailnet>.ts.net from any tailnet device
```

Secrets are passed at runtime via `env_file: .env.local` â€” they are never baked into the image layer.

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
