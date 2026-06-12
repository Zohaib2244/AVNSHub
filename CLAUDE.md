# CLAUDE.md — NutMagCard

## What this is
A living developer identity card for NutMag2469. A single webpage that shows real-time data — what I'm listening to, what game I'm playing, whether my homelab is alive, and what I'm currently building. Not a portfolio. Not a resume. A living identity artifact.

---

## Stack
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS + custom CSS variables
- **Animations**: Framer Motion
- **Deployment**: Self-hosted Docker (runs on the homelab — thematically fitting since the card reports on the same infra it lives on). Accessed via **Tailscale** (MagicDNS hostname + `tailscale serve` for automatic HTTPS within the tailnet) — no public domain purchase, no separate reverse proxy/Let's Encrypt setup, fully free and private
- **Language**: TypeScript throughout

---

## Aesthetic — never deviate from this

> **Design system reference**: [`DESIGN_VARIATIONS.md`](./DESIGN_VARIATIONS.md) (full written spec) and [`DESIGN_VARIATIONS.html`](./DESIGN_VARIATIONS.html) (live mockup — open directly in a browser, no build step). The **"G — Chunky Blocks + Accent Border"** column, in both the Dark Mode and Light Mode sections, is the chosen direction.

**Direction**: "Chunky Blocks + Accent Border" — warm, dense, sticker/stamp-bordered cards. This deliberately replaces the earlier CRT/neon/terminal look. Both dark and light themes are first-class and fully designed; ship with a theme toggle.

| Token | Dark | Light |
|---|---|---|
| Page background | `#13100c` | `#d8cfbc` |
| Card/surface background | `#1e1a14` (`#1a1610` nested) | `#f5f0e6` (`#faf6f0` nested) |
| Border | `#3d3220` | `#7a6a52` |
| Sticker shadow | `#070604` | `#a89878` |
| Text primary | `#e8dfc8` | `#1c1810` |
| Text muted | `#4a4030` / `#3a3020` | `#9a8870` / `#b0a090` |
| Orange accent | `#ff6b2b` | `#e05a18` |
| Cyan/teal accent | `#00b4c8` | `#00768a` |

- **Layout**: A configurable dashboard grid inside the `.frame` bezel — every block (including the namecard, NutBot, and the hub settings) is a widget placed by the widget framework (below). No hardcoded composition; `DEFAULT_ORDER` in `config/widgets.tsx` is just the starting arrangement
- **Card treatment ("sticker/stamp")**: `border-radius: 12–16px`, `border: 1.5px solid` (border token), hard offset `box-shadow: 3-5px 3-5px 0` (shadow token, **no blur**)
- **Typography**: `DotGothic16` for the logo (`1.7rem`), section/field labels (`0.62rem`, uppercase, `letter-spacing: 0.14em`), and headline stat numbers (`2.2rem`, `line-height: 1` — the largest text on the page). `JetBrains Mono` for primary data values (`1.25rem`, `font-weight: 500`), sub text (`0.75rem`), and chips/pills/badges (`0.6–0.65rem`, uppercase)
- **Icons**: Lucide, 14×14px, `stroke-width: 1.75`, prefixed to section labels, links, and badges
- **Motion**: Subtle data transitions plus the shell-owned expansion surfaces (flyout/overlay — below). No scanlines, no grain, no phosphor glow
- **Theme packs**: the token table above is the default **ember** palette. Alternate packs (slate, moss, plum — each with dark+light variants) live as `[data-palette="…"]` blocks in `globals.css` with metadata in `config/themes.ts`; picked from the hub settings widget, persisted to `localStorage["nutmag-palette"]`, applied pre-paint by the inline script in `app/layout.tsx`. New packs must define the full 14-token set for both modes and respect every other rule in this section
- **Never use**: Inter, Roboto, Arial, system fonts, purple gradients, centered portfolio layouts, pure black/white, neon glow, CRT scanlines/grain, blurred shadows

---

## Widget Framework — how everything on the page is built

A widget = **one content component + one manifest entry** in `config/widgets.tsx`. The framework supplies everything else: card chrome, label header, grid placement, expansion, polling, settings UI, persistence. Never hand-roll `.block` markup, fetch loops, or expansion logic inside a widget.

**Manifest (`WidgetManifest`)**: `{ id, title, icon, component, expandedComponent?, sizes, orientations, expandModes, defaults, settings?, flags? }`. Flags: `plainChrome` (no card chrome — identity), `customHeader` (chrome but widget renders its own header — github, steam), `accent` (orange left border), `className` (extra class on `.block`).

**Adding a widget**: write the content component (data + markup only, no shell), optionally an expanded component, register a manifest, append the id to `DEFAULT_ORDER`. Done — it's draggable, resizable, hideable, and configurable automatically.

**Inside a widget**:
- `useWidget()` (`components/framework/WidgetContext.tsx`) → `{ id, size, orientation, expanded, inOverlay, settings }`
- `usePolling<T>(url, intervalMs)` (`lib/usePolling.ts`) → shared per-URL cache + timer (the card and its flyout share one request); honors the global polling pref; never commits non-OK responses
- shared formatters in `lib/format.ts` (`timeAgo`, `formatDuration`, `formatMins`)

**Grid engine** (`components/Dashboard.tsx` + `.widget-grid` in `globals.css`): CSS grid, 6 columns at full width (4 ≤1440px, 2 ≤1023px, 1 ≤640px — mirrored in `lib/useGridColumns.ts`), `grid-auto-flow: row dense`, rows `minmax(128px, auto)` so content can never clip. `SPAN_MAP` converts size×orientation presets to spans: S-h 1×1 · S-v 1×2 · M-h 2×1 · M-v 2×2 · L-h 3×2 · L-v 2×3. Drag/drop is dnd-kit over the flat instance list (no transform strategy — live `arrayMove` in `onDragOver` reflows the real grid; a `DragOverlay` carries the visual).

**Expansion** (shell-owned, `components/framework/WidgetShell.tsx` + span overrides in `components/Dashboard.tsx`): `hover` → the expanded content reveals **inside the card** (`.inline-expand`, framer-motion animated height) while the widget temporarily claims **+1 row span**, so the expansion pushes the rows below down via dense reflow instead of inflating its own row — same-row neighbors keep their height; `grow` → the widget bumps one size tier on hover (S→M, M→L) and the cascade engine (`lib/gridCascade.ts`) shrinks whichever neighbor(s) it displaces by one tier, falling back to a generic micro view (`components/framework/MicroView.tsx`: icon over a blurred ghost) when a neighbor is squeezed to S-span without declaring "S" support — disabled below 4 grid columns; `overlay` → centered modal via portal (NutBot terminal, hub settings panel); `none` → inert. Span/position changes snap instantly — **never attach layout-animation systems to the grid items**: framer-motion `layout` and dnd-kit's `animateLayoutChanges` both re-measure + setState per item after a reflow, and dense flow moves *every* item, so either one loops into "Maximum update depth exceeded" (this is why `useSortable` passes `animateLayoutChanges: () => false`). The old flex-grow width-shift trick stays gone — expansion is span growth + grid reflow, never sibling width squeezing.

**Per-widget config**: edit mode (wrench toggle) shows a drag handle + gear per card; the gear opens `WidgetSettingsPopover` — placement controls (size/shape/expand/direction/hide, limited to what the manifest supports) plus a form auto-generated from the manifest's `settings` schema (`toggle | select | text | number`).

**Persistence** (`lib/layout.ts`): `localStorage["nutmag-layout"]` v2 — `{ version: 2, widgets: WidgetInstance[] }` where order = grid order and each instance carries `size/orientation/expand/expandDirection/hidden/settings`. Every mutation persists immediately. `sanitize()` migrates v1 column layouts (pair ids `media`/`disk-network` expand to their member widgets), clamps values to manifest capabilities, drops unknown ids/settings, and re-appends missing widgets so nothing can disappear. Other keys: `nutmag-theme`, `nutmag-palette`, `nutmag-prefs` (`lib/prefs.ts`: polling on/off, boot sequence on/off), `nutmag-sessions` (`lib/sessions.ts`).

**Hub settings widget** (`hub-settings`, "AVN Hub"): theme mode + palette picker on the card; overlay holds the full panel — widget visibility checklist, global prefs, layout reset. It can never be hidden (sanitize forces it visible).

---

## Modules

### 1. Identity Block
- Tag: `NutMag2469`
- Tagline: `"nutting magnesium amounts of stuff"` (static for now)
- Links: GitHub, homelab status
- Quicklinks: extensible row of icon links (`/config/links.ts`) — currently YouTube, LinkedIn, ChatGPT
- Logo: minimal NutMag icon mark (single icon, horizontal format, orange/cyan on dark)

### 2. Now Playing 🎵
- Source: Spotify Web API (Authorization Code flow)
- Shows: track name, artist, album art (blurred as background accent)
- Live: animated equalizer bars when track is playing
- Fallback: last played track + "X minutes ago" timestamp
- Env var: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`

### 3. Currently Playing 🎮
- Source: Steam API (public profile)
- Shows: game name, hours this session, total hours
- Fallback: last played game + time since
- Env var: `STEAM_API_KEY`, `STEAM_PROFILE_ID`

### 4. Homelab Status 🖥️
- Source: self-hosted `/status` endpoint on homelab server
- Shows: row of service dots (green = up, red = down) + average uptime %
- Cached every 60s — do not hammer the endpoint
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
- **v2 (design-only, see `lib/homelab.ts`)**: per-service `telemetry` — storage for Immich/Nextcloud, download queues for Sonarr/Radarr/qBittorrent, request queue for Jellyseerr, media sessions for Jellyfin — plus a top-level `host` block with connected drives/disks (capacity used/total) and container network rx/tx stats. The aggregator that produces this is a separate homelab-side project, not yet built.

### 5. GitHub Activity
- Source: GitHub public events API (`/users/NutMag2469/events/public`), filtered to push commits
- Shows: most recent commit message + repo + relative time — standalone hero block with the orange-accent left border
- More-info panel: next several recent commits (message · repo · relative time)
- Env var (optional): `GITHUB_TOKEN` — raises rate limit from 60/hr to 5000/hr; works unauthenticated too

---

## Project Structure
```
/
├── app/
│   ├── page.tsx              # BootSequence + GlyphStrip + LayoutProvider/Dashboard
│   ├── layout.tsx            # Root layout, fonts, pre-paint theme/palette script
│   └── api/                  # Proxy routes (hide all API keys)
│       ├── now-playing/  currently-playing/  steam-library/  spotify-control/
│       ├── homelab/  homelab-v2/  uptime/
│       └── github-activity/  github-repos/
├── components/
│   ├── framework/            # THE widget framework — touch with care
│   │   ├── WidgetShell.tsx   # card chrome + label + expansion machinery
│   │   ├── WidgetContext.tsx # useWidget() — size/orientation/expanded/settings
│   │   ├── WidgetFlyout.tsx  # hover expansion (portal, overlays siblings)
│   │   ├── WidgetOverlay.tsx # click expansion (centered modal)
│   │   └── WidgetSettingsPopover.tsx  # gear popover (placement + schema form)
│   ├── widgets/
│   │   ├── HubSettings.tsx       # "AVN Hub" — theme/palette/visibility/prefs/reset
│   │   └── NutBotFaceWidget.tsx  # face-only nutbot card
│   ├── Dashboard.tsx         # grid + dnd-kit drag/drop + edit mode
│   ├── LayoutProvider.tsx    # layout store context (instances, editMode)
│   ├── NutBotTerminal.tsx    # tabs/mock shells/xterm — nutbot's overlay
│   └── *.tsx                 # widget content components (no shell markup)
├── config/
│   ├── widgets.tsx           # WIDGETS manifest registry + SPAN_MAP + DEFAULT_ORDER
│   ├── themes.ts             # theme pack metadata (tokens live in globals.css)
│   └── links.ts              # Identity block quicklinks (extensible)
├── lib/
│   ├── layout.ts             # layout store v2 (instances, sanitize, v1 migration)
│   ├── theme.ts              # mode (light/auto/dark) + palette stores
│   ├── prefs.ts              # global prefs store (polling, boot sequence)
│   ├── usePolling.ts         # shared per-URL polling cache
│   ├── useGridColumns.ts     # breakpoint → grid column count
│   ├── format.ts             # timeAgo / formatDuration / formatMins
│   ├── sessions.ts           # session tracker store
│   └── spotify.ts  steam.ts  github.ts  homelab.ts   # server-side API clients
├── styles/
│   └── globals.css           # tokens (+ theme packs), grid, shell/flyout/overlay CSS
├── CLAUDE.md                 # This file
└── .env.local                # All API keys — never commit this
```

---

## API Routes — always proxy, never expose keys client-side

All external API calls go through `/app/api/` routes. The client only ever calls internal Next.js endpoints. Never put API keys in client components.

Polling interval: 30s for Now Playing, 60s for everything else.

---

## Current Focus
> **MVP — get data flowing before touching UI** (✅ shipped)
> 1. Set up Next.js project, Tailwind, Framer Motion
> 2. Build Spotify API route + NowPlaying component (data only, unstyled)
> 3. Build Steam API route + CurrentlyPlaying component (data only, unstyled)
> 4. Build homelab status endpoint on server + proxy route
> 5. Wire up all data, confirm everything returns correctly
> 6. Apply full aesthetic per the Design System (Chunky Blocks + Accent Border, dark/light tokens, hover-to-expand capsules) — see `DESIGN_VARIATIONS.md`/`.html`
> 7. Deploy via Docker + Tailscale (see Phase 8 below)

> **Widget framework refactor** (✅ shipped — see "Widget Framework" section)
> - Manifest-driven widget registry; shell owns chrome/expansion/settings; shared `usePolling`/`format` plumbing
> - Configurable grid (size/orientation presets → spans, dense auto-flow) replacing the fixed 4-column layout; dnd-kit drag everywhere
> - Per-widget config (size, shape, expand mode/direction, hide, schema-driven settings) editable from the site, persisted to localStorage (v1 layouts migrate automatically)
> - Hub settings widget (theme mode, palette packs, visibility, global prefs, reset); NutBot split into face widget + terminal overlay

> **Now — content finalization & v2 modules**
> - Homelab v2 host telemetry (drives, network) — types defined in `lib/homelab.ts`; aggregator still to build on the homelab side
> - Personal uptime stat — switch from fixed "days since project epoch" to live session uptime (resets on server restart), plus a future DB-backed historical tracker
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
HOMELAB_MOCK_DATA=      # optional, dev-only — "true" serves realistic mock v2 telemetry
                        # (CPU/Mem/disks/network + all 8 services) instead of HOMELAB_STATUS_URL,
                        # for testing the new capsules on machines without homelab access
NEXT_PUBLIC_NUTBOT_SHELL_URL=  # optional, dev-only — set to ws://localhost:4001 (with
                        # `npm run nutbot:shell` running) to add a "real shell" tab to NutBot,
                        # backed by an actual pty on this machine. NEVER set in a
                        # deployed/Tailscale-exposed build
```

## Deploy — Docker + Tailscale

```bash
# On the homelab machine, in this repo:
docker compose up -d --build

# Expose over Tailscale HTTPS (no domain, no cert config needed):
tailscale serve https / http://localhost:3000
# → reachable at https://nutmagcard.<tailnet>.ts.net from any tailnet device
```

Secrets are passed at runtime via `env_file: .env.local` — they are never baked into the image layer.

---

## Still to Confirm (fill these in before starting)
- [x] Steam profile ID + confirm profile is public — `76561199044933923`, confirmed public
- [x] Homelab services — real list: immich, jellyfin, jellyseerr, radarr, sonarr, jackett, qbittorrent, nextcloud
- [x] Domain for deployment — **No purchase needed**: serving over Tailscale instead (MagicDNS hostname / `tailscale serve` for HTTPS within the tailnet). Keeps the whole stack free and private; `tailscale funnel` remains an option later if public access is ever wanted
- [x] Vercel or self-hosted Docker? — **Self-hosted Docker**
- [x] Custom logo file ready or generate one? — **Generate**: minimal NutMag icon mark as inline SVG, dot-matrix-inspired, orange/cyan on dark

---

## Retro Polish & Interaction Ideas (weave in during the aesthetic pass — step 6 — or just after)
> Written under the old CRT aesthetic — re-check each against the Design System before implementing. The widget framework's flyout/overlay expansion (above) is now the primary interaction pattern.
- **Boot sequence intro**: brief retro-terminal "boot log" animation (dot-matrix text scrolling system checks) on first load, before the card resolves
- **Glyph-style status pulse**: thin strip of light (orange/cyan/cream) that pulses based on overall state — steady glow when everything's up, irregular flicker if a homelab service is down (Nothing Phone Glyph-inspired)
- **Personal uptime stat**: live server-process uptime ("Xh Ym running this session" — resets on restart), shown in the namecard. Future: a small DB-backed history service tracks uptime over time for a calendar/heatmap view in Homelab's more-info panel

---

## Post-MVP Backlog (do not build until MVP ships)
- Shareable PNG snapshot of the card
- Visitor counter (monospace, bottom corner)
- Mobile stacked layout
- Konami code easter egg
- AI-generated daily tagline via Claude API
- Light/dark theme toggle — both fully designed (see Aesthetic section / `DESIGN_VARIATIONS.html`); wire up once core data flow ships