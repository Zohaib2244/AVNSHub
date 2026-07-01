# AVN Hub — Front Page to Your Life

AVN Hub is a living personal dashboard for what you are listening to, playing,
building, and running. It is how you configure what you see, how it looks,
where everything lives, and how the dashboard behaves without touching code.

Everything the Hub controls is persisted to `localStorage` and applied
immediately — no save button, no page reload.

---

## Hub Core

### Hub Core tabs

A fixed control strip reachable from every screen regardless of which widget
is where. In Slot Layout it sits as right-edge tabs on the main frame. Click
the gear icon (settings) or grid icon (widget manager) to open that tab, click
again, press `Escape`, or click anywhere outside to close.

The wrench/lock tab toggles edit mode in one click.

The settings tab contains accordion sections — opening one closes any that was
already open:

**Appearance** — theme mode, colour palette, wallpaper (image/video upload or
clear), canvas backdrop mode, widget backdrop default, and mouse parallax toggle.

**General** — live-data polling, boot-sequence intro, and reset layout/widget
configuration.

**Layout** — per-region grid dimensions plus layout import/export controls.

**Canvases** — at-a-glance canvas list: rename, change icon, delete, or add
canvases from inside Hub Core without using the edge pills.

The Widget Manager tab searches, filters, adds, removes, imports, exports, or
permanently deletes custom widgets.

---

## Canvases

A vertical pill stack on the edge of the frame, directly below the
wrench/settings/widgets tabs. Each pill is a named canvas — an independent
context (home, work, entertainment, whatever you actually use) with its own:

- Widget arrangement (Slot Layout placements/region dims)
- Theme mode + palette
- Wallpaper + backdrop modes + parallax setting

Switching canvases re-skins the whole card — not just the grid.

**Switching** — click a pill.

**Canvas switch protection** — if a widget generation is active in the Widget
Creator, clicking another canvas pill shows a native-styled AVN Hub confirmation
dialog (not a browser `window.confirm`) explaining that switching will cancel the
build. Confirming switches and aborts the generation cleanly; cancelling stays on
the current canvas.

**Renaming / changing icon** — double-click a pill to open its manage flyout
(name field + icon picker), or use the "canvases" accordion in Hub Core settings
for an at-a-glance list. **Creating** — click the `+` pill to open the name/icon
panel; nothing is created until you press `create`. Press `cancel` or `Escape` to
back out. **Deleting** — open a pill's manage flyout and press the trash icon; the
last remaining canvas can't be deleted, and deleting one also clears its
layout/theme/wallpaper data.

New canvases start empty (no widgets placed) with default theme/wallpaper —
not a clone of whichever canvas you created them from.

---

## Layout modes

### Default Mode (Slot Layout)

The default. The page is divided into three named **regions**:

| Region | Where it appears | Configurable? |
| --- | --- | --- |
| Column L | Left sidebar column | Yes — rows × cols in Hub Core |
| Column R | Right sidebar column | Yes |
| Base | Bottom-center grid | Yes |
| Terminal | Center terminal slot (NutBot lives here) | No — 1 fixed slot |

Each region is an independent CSS grid. You place widgets into cells of that
grid manually (in edit mode). Widgets occupy a rectangle of cells
(`colSpan × rowSpan`), which you can resize by dragging the edge handles.

**Configuring region grid size** — open Hub Core → Layout section. Each
region shows a `rows × columns` input pair. Changing these re-tiles the grid;
any placed widgets stay in their stored cell positions (clamped to the new
bounds automatically).

**Placing a widget** — open the Hub Core Widget Manager tab, then press `+`
on an available widget. The add action asks where to place it and only shows
regions (`left`, `right`, `base`) that currently have enough free cells. You
can also enter edit mode and click an empty `+` cell inside any region to place
directly into that cell.

**Resizing a widget** — grab any of the four edge handles that appear in edit
mode and drag outward to grow or inward to shrink. The widget cannot shrink
below its registered minimum footprint (1×1 by default).

**Moving a widget** — drag the move handle (cross-arrow icon in the top-left
corner of the card in edit mode) to reposition it within its region.

**Removing a widget** — click the × button in the top-right of the card in
edit mode, or use the Hub Core Widget Manager tab. Removed widgets go back
to the "available" pool — they are never deleted.

**Hover On Expand (HOE)** — an opt-in visual preview available in Default mode.
When enabled on a widget, hovering over it makes it visually expand into
adjacent space while directly edge-touching neighbors contract to make room.
This is transient (no layout is saved) and reverts the moment you move away.
Enable per-widget via its gear menu → `slot hover expand`. HOE requires a
fine-pointer device (mouse); it is disabled on touch screens and when
`prefers-reduced-motion` is set.

### Graph Mode

A free-form auto-flow grid. Widgets are placed by the framework in order;
you drag them to rearrange and use the gear menu to change each widget's size
(`S / M / L`) and orientation (`horizontal / vertical`). There is no fixed
region structure — everything shares one flat grid. Useful for a denser,
more fluid layout.

Per-widget size/orientation settings live in each card's gear menu. Visibility
and add/remove controls live in the Hub Core Widget Manager tab.

---

## Edit mode

Toggle edit mode from the Hub Core wrench/lock tab. While editing:

- Every widget card shows a **move handle** (top-left), **× remove** (top-right),
  and **gear** (settings) button.
- In Default mode, four edge **resize handles** also appear.
- In Graph mode, you can drag cards to rearrange them.
- Reset controls remain in Hub Core settings.

Lock the layout when done to prevent accidental moves.

---

## Widget Manager

The Widget Manager is its own Hub Core tab, separate from the AVN Hub canvas
settings.

In Slot Layout it lists placed widgets and available widgets. Available widgets
open a region chooser, and only regions with enough free cells are shown. Use
the search field to narrow placed and available widgets by title or id.

In Graph Layout, on-screen widgets have a `−` button to hide them
(`hidden: true`). Available widgets have a `+` button to add them back
(`hidden: false`).

---

## NutBot v2.2

NutBot occupies the fixed center terminal slot. Its terminal is a single
combined header bar (title + tabs + controls in one row) with an animated
sliding pill that moves between active tabs.

### NutBot tabs

| Tab | Purpose |
| --- | --- |
| `◈ log` | Ambient dashboard status ticker |
| `◎ chat` | Conversational AI — Bonfire/local LLM or CLI harness fallback |
| `⌨ shells` | Real host pseudo-terminal sessions with sidebar navigation |
| `✦ creator` | AI-assisted custom widget generation |

### Model Picker

The unified model picker (top-right of the terminal) controls which backend
both Chat and Widget Creator use. Selecting a model here sets it atomically
for both tabs — Chat reads `chatBackend`, Creator reads `activeHarness`, and
the picker writes both in one call so they stay in sync.

| Dot color | Backend |
| --- | --- |
| Orange | Bonfire (local LLM) |
| Cyan | claude CLI |
| Purple | codex CLI |
| Green | opencode CLI |

### Chat

NutBot Chat connects to a self-hosted Bonfire instance when reachable, then
falls back through the shared harness chain. Session continuity: Claude uses
`--session-id`/`--resume`; Codex uses `exec resume`. See
[NUTBOT_CHAT_SETUP.md](NUTBOT_CHAT_SETUP.md).

### Shells

Each shell is a real pty session on the host machine. Session panes stay
mounted (`display: none` when inactive) so scrollback and the running process
survive tab switches. Create more sessions with `+ new` in the sidebar.

**Security note**: the shell is on by default and gives anyone who can reach
the UI a real shell on the host as the server's user. It is intended for the
single-user/self-hosted/full-trust model. Set `NUTBOT_SHELL_DISABLED=true` in
`.env.local` to disable it if you expose the hub more widely.

### Creator tab

The creator tab scaffolds new widgets end-to-end. See [Widget Creator](#widget-creator) below.

---

## Widget Creator

The creator front page lists projects with a hero "New Widget" banner, pipeline
stage chips, and section counts (in-progress vs. created).

### Pipeline stages

Each project moves through up to three stages, shown as chips in the project
row and the workspace pipeline bar:

| Stage | What happens |
| --- | --- |
| **Plan** | Chat with AI to develop the concept — get suggestions, a structured brief, and data shape definition |
| **Ideate** | AI generates HTML/CSS mockups rendered live; regenerate variations or finalize one as the build reference |
| **Build** | AI writes the real `.tsx` component; `tsc` validates it; rolls back on type errors before registering |

### Generation lock

While AI is generating in build mode the settings panel is locked (dimmed,
`pointer-events: none`) so no settings can change mid-build. The back button
is also disabled. If the build canvas unmounts mid-generation (e.g. canvas
switch confirmed), the fetch is aborted and `workingProjectId` is cleared.

### Harness chain and fallback

The creator uses a harness chain (`claude` → `codex` → `opencode` by default)
with auto-fallback on rate limits. The active harness is shown in the status
bar during generation. TypeScript errors trigger a self-repair loop — the errors
are sent back to the AI as context for another generation pass.

---

## Widget keyboard focus

Widgets that use keyboard input (spacebar for the cube timer, letter keys for
Wordle, etc.) only capture keyboard events when the widget has **keyboard focus**.

**Setting focus:** clicking anywhere on a widget gives it keyboard focus. A
subtle orange border on the card signals the active widget.

**Clearing focus:** click outside any widget (on the canvas background) or
press `Escape`. Entering edit mode also clears keyboard focus.

**Pattern for widget authors** — gate any keyboard listener with `isFocused`
from `useWidget()`:

```tsx
const { isFocused } = useWidget();

useEffect(() => {
  if (!isFocused) return;
  const handler = (e: KeyboardEvent) => { /* ... */ };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [isFocused]);
```

See [CREATING_WIDGETS.md](CREATING_WIDGETS.md) for the full authoring pattern.

---

## HubDialog

A native AVN Hub confirmation dialog for actions that need user acknowledgment
before proceeding. Styled with the design system tokens (sticker/stamp card,
DotGothic16 title, JetBrains Mono body, orange confirm button). Triggered via
`showHubDialog(config)` from `lib/hubDialog.ts`; rendered once inside
`LayoutProvider`. Currently used for canvas switch protection when a widget
generation is active.

---

## Theme system

### Mode

Three options, set from Hub Core settings:

| Mode | Behaviour |
| --- | --- |
| `light` | Always light |
| `dark` | Always dark |
| `auto` | Follows the OS `prefers-color-scheme` setting |

Persisted to `localStorage["nutmag-theme"]`. Applied via a pre-paint inline
script in the root layout so there is never a flash of the wrong theme on load.

### Colour palettes

Eight palettes, each fully designed for both dark and light modes:

| Palette | Accent colours | Mood |
| --- | --- | --- |
| **ember** (default) | Orange `#ff6b2b` + Cyan `#00b4c8` | Warm, amber |
| **slate** | Blue `#4da3ff` + Teal `#00c8a0` | Cool, monochromatic |
| **moss** | Green `#8fc63c` + Amber `#d89a28` | Earthy, natural |
| **plum** | Pink `#e84a8a` + Gold `#d8a830` | Vivid, expressive |
| **reef** | Coral + mint | Aquatic, warm-cool |
| **raspberry** | Berry + cyan | Bright, playful |
| **circuit** | Yellow + teal | Technical, punchy |
| **graphite** | Orange + green | Neutral, industrial |

Switch palette from Hub Core settings → Appearance. The picker shows a
three-swatch preview (card bg + two accents) for each option.

Persisted to `localStorage["nutmag-palette"]`.

---

## Wallpaper & backdrop

Three independent, stacked layers — each set per-canvas from Hub Core →
Appearance:

| Layer | What it is | Controlled by |
| --- | --- | --- |
| BG | An optional wallpaper image or short looping video, full-bleed behind everything. No mode of its own — it's just there, or it isn't. | Drag-drop or browse picker |
| Canvas | The bezel holding the grid (`.frame`) | "canvas backdrop": solid / blur / transparent / glass |
| Widgets | Every widget card (`.block`) | "widget backdrop": solid / blur / transparent / glass — a *global default* every widget inherits via "auto" |

**solid** — opaque card/canvas, wallpaper hidden behind it.
**blur** — translucent frosted-glass `backdrop-filter`.
**transparent** — background removed entirely, raw wallpaper shows through.
**glass** — Liquid-Glass-style approximation: more transparent fill, stronger
`blur()` paired with `saturate()` so colors behind don't wash out; on canvas
only, an inset top-edge highlight for the glossy rim-light read.

Canvas and widget backdrop are independent dials — setting one does not change
the other. Any single widget can override the global widget-backdrop default
from its own gear menu (`card backdrop`: auto / solid / blur / transparent /
glass) — `auto` means "inherit whatever the global widget-backdrop default is."

**Mouse parallax** — an opt-in toggle next to the wallpaper picker. When on,
the wallpaper subtly tracks the cursor (off by default).

Wallpaper images/videos are stored in IndexedDB (too large for `localStorage`'s
quota), namespaced per canvas. Backdrop modes and the parallax toggle are small
strings, so they stay in `localStorage` like theme mode and palette.

---

## General preferences

Available in Hub Core settings, or via the `lib/prefs.ts` store:

| Preference | Default | What it does |
| --- | --- | --- |
| **Live data polling** | on | When off, all `usePolling` hooks pause — no API calls are made. Useful when working offline or debugging. |
| **Boot sequence intro** | on | The retro terminal "boot log" animation that plays on first load. Turn off for an instant card. |
| **NutBot chat backend** | auto | `auto` prefers Bonfire and falls back through the shared CLI harness chain; can also be pinned to Bonfire, a specific harness, or off. See [NUTBOT_CHAT_SETUP.md](NUTBOT_CHAT_SETUP.md). |
| **Widget Creator enabled** | on | When off, the creator tab shows a disabled placeholder. |

Persisted to `localStorage["nutmag-prefs"]`.

---

## Reset

Resets are destructive and cannot be undone:

| Reset | Where | What it clears |
| --- | --- | --- |
| Reset layout & widget config | Hub Core settings → General | Graph widget config plus Slot placements and region dims |

None of the resets touch theme, palette, or global prefs.

---

## Persistence keys

These retain the original `nutmag-*` names for compatibility with existing
layouts and preferences.

| Key | What's stored |
| --- | --- |
| `nutmag-canvases` | Canvas identities (id/name/icon) + active canvas id |
| `nutmag-layout` | Graph mode widget order, size, orientation, hidden, per-widget settings |
| `nutmag-slot-layout` | Default mode: region dims + per-region widget placements |
| `nutmag-layout-mode` | Active layout mode (`graph` or `slots`) |
| `nutmag-theme` | Theme mode (`light`, `auto`, `dark`) |
| `nutmag-palette` | Active colour palette |
| `nutmag-backdrop` | Canvas backdrop mode (`solid`, `blur`, `transparent`, `glass`) |
| `nutmag-widget-backdrop` | Global widget backdrop default |
| `nutmag-parallax` | Mouse parallax on/off |
| `nutmag-prefs` | Global prefs (polling, boot sequence, NutBot chat backend, Widget Creator enabled flag, shared harness choice/chain) |
| `nutmag-sessions` | Session tracker (uptime stats) |
| `nutmag-ambient-tracks` / `-selected` / `-volume` | Ambient Sound custom track registry, selected track, volume (global, not per-canvas) |

Every key from `nutmag-slot-layout` through `nutmag-parallax` is **per-canvas**:
the original/default canvas keeps the bare key above (so existing users need
no migration); every canvas created after Canvases shipped gets a
`<key>::<canvasId>` suffixed key instead. See `lib/canvases.ts`'s
`canvasScopedKey()`.

Wallpaper images/videos and user-uploaded ambient clips are too large for
`localStorage`'s quota, so those live in **IndexedDB** instead (database
`nutmag-db`, object store `blobs`, keyed `wallpaper:<canvasId>` /
`ambient:<trackId>`) — see `lib/idb.ts`.

All keys are written immediately on change and read on mount. Corrupted or
missing keys fall back to sensible defaults automatically.

---

## Runtime model (why AVN Hub runs the dev server)

AVN Hub runs the Next.js **dev server** (`next dev`, Turbopack) as its actual
runtime — not a compiled `next build` / `next start` standalone image. This is
intentional, and it's a consequence of the widget creator being the centre of
the product.

When NutBot generates a widget it **writes real `.tsx` into the source tree**
(`components/widgets/custom/<slug>/`) and edits `config/customRegistry.json`
and `config/customComponentMap.tsx`. For that widget to appear in the running hub
without you rebuilding and restarting, three things must be true at runtime:

1. **File-watcher / HMR** picks up the newly written files and Fast-Refreshes
   them in. (The creator's "add to layout" even retries briefly while waiting
   for HMR to land — see `ChatCanvas.tsx`.)
2. The **TypeScript toolchain** (`tsc`) is present, so generated widgets are
   validated and rolled back on type errors before registering.
3. The **full source tree + an agent CLI** (`claude` / `codex` / `opencode`)
   are present, because the creator reads the tree and shells out to the CLI.

A slim production build has none of these, so it would break the headline
feature. The usual "never run `next dev` in production" guidance is a
*multi-tenant performance + security* rule; AVN Hub is **single-user,
self-hosted, full-trust** (your own machine, reached privately over your
tailnet), so that rule doesn't apply and the dev-server runtime is the correct
fit rather than a workaround.

**Resilience.** Because generated code runs in your app, each widget is wrapped
in an error boundary (`WidgetErrorBoundary` in
`components/framework/WidgetShell.tsx`) so a runtime throw in one widget renders
an inline error instead of white-screening the whole hub. The boundary resets
when you resize the widget, change its settings, or HMR swaps the module after
an edit — so a fixed widget recovers without a manual reload. Pair this with the
container's `restart: unless-stopped` policy to auto-recover the long-lived dev
server.
