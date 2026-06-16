# AVN Hub — Front Page to Your Life

AVN Hub is the control layer sitting on top of NutMagCard. It is how you
configure what you see, how it looks, where everything lives, and how the card
behaves — without touching code. Think of it as the OS settings panel for your
personal identity card.

Everything the Hub controls is persisted to `localStorage` and applied
immediately — no save button, no page reload.

---

## Two access points

### 1. Hub Core tabs (top-right corner)

A fixed control strip reachable from every screen regardless of which widget
is where. In Slot Layout it sits as right-edge tabs on the main frame. Click
the gear icon (settings) or grid icon (widget manager) to open that tab, click
again, press `Escape`, or click anywhere outside to close.

Contains two independently collapsible sections:

**AVN Hub** — global controls:
- **Edit mode** — toggle between `locked` (layout is frozen) and `editing`
  (drag handles, gear icons, and resize handles appear on every widget).
  In editing mode a **reset** button also appears to wipe the current
  layout back to defaults.
- **Layout** — switch between the two layout modes (see below).

**Default mode / Graph mode** — mode-specific settings for whichever layout is
currently active. In Default mode this is the per-region grid-dims editor
(see [Default Mode](#default-mode-slot-layout)).

**Widget Manager tab** — add, remove, or permanently delete custom widgets.

### 2. Hub Settings widget (`#hub-settings`, "AVN Hub")

A widget you can place on the dashboard like any other. It exposes the same
theme and palette controls at different levels of detail depending on its size:

| Size | What you get |
|------|-------------|
| S | Theme mode toggle only (light / auto / dark) |
| M | Theme mode + colour palette picker |
| L | Theme mode + palette + general prefs + reset button |

---

## Layout modes

### Default Mode (Slot Layout)

The default. The page is divided into three named **regions**:

| Region | Where it appears | Configurable? |
|--------|-----------------|--------------|
| Column L | Left sidebar column | Yes — rows × cols in Hub Core |
| Column R | Right sidebar column | Yes |
| Base | Bottom-center grid | Yes |
| Terminal | Center terminal slot (NutBot lives here) | No — 1 fixed slot |

Each region is an independent CSS grid. You place widgets into cells of that
grid manually (in edit mode). Widgets occupy a rectangle of cells
(`colSpan × rowSpan`), which you can resize by dragging the edge handles.

**Configuring region grid size** — open Hub Core → Default Mode section. Each
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

Toggle edit mode from Hub Core → AVN Hub → edit mode or from any widget's gear
menu. While editing:

- Every widget card shows a **move handle** (top-left), **× remove** (top-right),
  and **gear** (settings) button.
- In Default mode, four edge **resize handles** also appear.
- In Graph mode, you can drag cards to rearrange them.
- A **reset** button appears in Hub Core to wipe the current mode's layout back
  to its default arrangement.

Lock the layout when done to prevent accidental moves.

---

## Widget Manager

The Widget Manager is its own Hub Core tab, separate from the AVN Hub canvas
settings.

In Slot Layout it lists placed widgets and available widgets. Available widgets
open a region chooser, and only regions with enough free cells are shown.

In Graph Layout, on-screen widgets have a `−` button to hide them
(`hidden: true`). Available widgets have a `+` button to add them back
(`hidden: false`).

---

## Theme system

### Mode

Three options, set from Hub Settings or Hub Core:

| Mode | Behaviour |
|------|-----------|
| `light` | Always light |
| `dark` | Always dark |
| `auto` | Follows the OS `prefers-color-scheme` setting |

Persisted to `localStorage["nutmag-theme"]`. Applied via a pre-paint inline
script in the root layout so there is never a flash of the wrong theme on load.

### Colour palettes

Four palettes, each fully designed for both dark and light modes:

| Palette | Accent colours | Mood |
|---------|---------------|------|
| **ember** (default) | Orange `#ff6b2b` + Cyan `#00b4c8` | Warm, amber |
| **slate** | Blue `#4da3ff` + Teal `#00c8a0` | Cool, monochromatic |
| **moss** | Green `#8fc63c` + Amber `#d89a28` | Earthy, natural |
| **plum** | Pink `#e84a8a` + Gold `#d8a830` | Vivid, expressive |

Switch palette from the Hub Settings widget (M or L size) or Hub Core. The
picker shows a three-swatch preview (card bg + two accents) for each option.

Persisted to `localStorage["nutmag-palette"]`.

---

## General preferences

Available in Hub Settings at L size, or via the `lib/prefs.ts` store:

| Preference | Default | What it does |
|------------|---------|-------------|
| **Live data polling** | on | When off, all `usePolling` hooks pause — no API calls are made. Useful when working offline or debugging. |
| **Boot sequence intro** | on | The retro terminal "boot log" animation that plays on first load. Turn off for an instant card. |

Persisted to `localStorage["nutmag-prefs"]`.

---

## Reset

Resets are destructive and cannot be undone:

| Reset | Where | What it clears |
|-------|-------|---------------|
| Reset graph layout | Hub Core (edit mode, graph active) | Graph mode widget order, sizes, orientations, and settings |
| Reset default layout | Hub Core (edit mode, default active) | Slot placements and region dims |
| Reset layout & widget config | Hub Settings (L size) | Both layout modes + resets layout mode to Default |

None of the resets touch theme, palette, or global prefs.

---

## Persistence keys

| Key | What's stored |
|-----|--------------|
| `nutmag-layout` | Graph mode widget order, size, orientation, hidden, per-widget settings |
| `nutmag-slot-layout` | Default mode: region dims + per-region widget placements |
| `nutmag-layout-mode` | Active layout mode (`graph` or `slots`) |
| `nutmag-theme` | Theme mode (`light`, `auto`, `dark`) |
| `nutmag-palette` | Active colour palette (`ember`, `slate`, `moss`, `plum`) |
| `nutmag-prefs` | Global prefs (polling, boot sequence) |
| `nutmag-sessions` | Session tracker (uptime stats) |

All keys are written immediately on change and read on mount. Corrupted or
missing keys fall back to sensible defaults automatically.
