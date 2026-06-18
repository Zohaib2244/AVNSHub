# AVN Hub — Front Page to Your Life

AVN Hub is a living personal dashboard for what you are listening to, playing,
building, and running. It is how you configure what you see, how it looks,
where everything lives, and how the dashboard behaves without touching code.

Everything the Hub controls is persisted to `localStorage` and applied
immediately â€” no save button, no page reload.

---

## Hub Core

### Tabs

A fixed control strip reachable from every screen regardless of which widget
is where. In Slot Layout it sits as right-edge tabs on the main frame. Click
the gear icon (settings) or grid icon (widget manager) to open that tab, click
again, press `Escape`, or click anywhere outside to close.

The wrench/lock tab toggles edit mode in one click.

The settings tab contains independently collapsible sections. More than one
section can stay open at the same time:

**Appearance** â€” theme mode and colour palette.

**General** â€” live-data polling, boot-sequence intro, and reset layout/widget
configuration.

**Layout** â€” per-region grid dimensions plus layout import/export controls.

The Widget Manager tab searches, filters, adds, removes, imports, exports, or
permanently deletes custom widgets.

---

## Layout modes

### Default Mode (Slot Layout)

The default. The page is divided into three named **regions**:

| Region | Where it appears | Configurable? |
|--------|-----------------|--------------|
| Column L | Left sidebar column | Yes â€” rows Ã— cols in Hub Core |
| Column R | Right sidebar column | Yes |
| Base | Bottom-center grid | Yes |
| Terminal | Center terminal slot (NutBot lives here) | No â€” 1 fixed slot |

Each region is an independent CSS grid. You place widgets into cells of that
grid manually (in edit mode). Widgets occupy a rectangle of cells
(`colSpan Ã— rowSpan`), which you can resize by dragging the edge handles.

**Configuring region grid size** â€” open Hub Core â†’ Layout section. Each
region shows a `rows Ã— columns` input pair. Changing these re-tiles the grid;
any placed widgets stay in their stored cell positions (clamped to the new
bounds automatically).

**Placing a widget** â€” open the Hub Core Widget Manager tab, then press `+`
on an available widget. The add action asks where to place it and only shows
regions (`left`, `right`, `base`) that currently have enough free cells. You
can also enter edit mode and click an empty `+` cell inside any region to place
directly into that cell.

**Resizing a widget** â€” grab any of the four edge handles that appear in edit
mode and drag outward to grow or inward to shrink. The widget cannot shrink
below its registered minimum footprint (1Ã—1 by default).

**Moving a widget** â€” drag the move handle (cross-arrow icon in the top-left
corner of the card in edit mode) to reposition it within its region.

**Removing a widget** â€” click the Ã— button in the top-right of the card in
edit mode, or use the Hub Core Widget Manager tab. Removed widgets go back
to the "available" pool â€” they are never deleted.

**Hover On Expand (HOE)** â€” an opt-in visual preview available in Default mode.
When enabled on a widget, hovering over it makes it visually expand into
adjacent space while directly edge-touching neighbors contract to make room.
This is transient (no layout is saved) and reverts the moment you move away.
Enable per-widget via its gear menu â†’ `slot hover expand`. HOE requires a
fine-pointer device (mouse); it is disabled on touch screens and when
`prefers-reduced-motion` is set.

### Graph Mode

A free-form auto-flow grid. Widgets are placed by the framework in order;
you drag them to rearrange and use the gear menu to change each widget's size
(`S / M / L`) and orientation (`horizontal / vertical`). There is no fixed
region structure â€” everything shares one flat grid. Useful for a denser,
more fluid layout.

Per-widget size/orientation settings live in each card's gear menu. Visibility
and add/remove controls live in the Hub Core Widget Manager tab.

---

## Edit mode

Toggle edit mode from the Hub Core wrench/lock tab. While editing:

- Every widget card shows a **move handle** (top-left), **Ã— remove** (top-right),
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

In Graph Layout, on-screen widgets have a `âˆ’` button to hide them
(`hidden: true`). Available widgets have a `+` button to add them back
(`hidden: false`).

---

## Theme system

### Mode

Three options, set from Hub Core settings:

| Mode | Behaviour |
|------|-----------|
| `light` | Always light |
| `dark` | Always dark |
| `auto` | Follows the OS `prefers-color-scheme` setting |

Persisted to the legacy `localStorage["nutmag-theme"]` key. Applied via a pre-paint inline
script in the root layout so there is never a flash of the wrong theme on load.

### Colour palettes

Eight palettes, each fully designed for both dark and light modes:

| Palette | Accent colours | Mood |
|---------|---------------|------|
| **ember** (default) | Orange `#ff6b2b` + Cyan `#00b4c8` | Warm, amber |
| **slate** | Blue `#4da3ff` + Teal `#00c8a0` | Cool, monochromatic |
| **moss** | Green `#8fc63c` + Amber `#d89a28` | Earthy, natural |
| **plum** | Pink `#e84a8a` + Gold `#d8a830` | Vivid, expressive |
| **reef** | Coral + mint | Aquatic, warm-cool |
| **raspberry** | Berry + cyan | Bright, playful |
| **circuit** | Yellow + teal | Technical, punchy |
| **graphite** | Orange + green | Neutral, industrial |

Switch palette from Hub Core settings. The
picker shows a three-swatch preview (card bg + two accents) for each option.

Persisted to the legacy `localStorage["nutmag-palette"]` key.

---

## General preferences

Available in Hub Core settings, or via the `lib/prefs.ts` store:

| Preference | Default | What it does |
|------------|---------|-------------|
| **Live data polling** | on | When off, all `usePolling` hooks pause â€” no API calls are made. Useful when working offline or debugging. |
| **Boot sequence intro** | on | The retro terminal "boot log" animation that plays on first load. Turn off for an instant card. |

Persisted to the legacy `localStorage["nutmag-prefs"]` key.

---

## Reset

Resets are destructive and cannot be undone:

| Reset | Where | What it clears |
|-------|-------|---------------|
| Reset layout & widget config | Hub Core settings â†’ General | Graph widget config plus Slot placements and region dims |

None of the resets touch theme, palette, or global prefs.

---

## Persistence keys

These retain the original `nutmag-*` names for compatibility with existing
layouts and preferences.

| Key | What's stored |
|-----|--------------|
| `nutmag-layout` | Graph mode widget order, size, orientation, hidden, per-widget settings |
| `nutmag-slot-layout` | Default mode: region dims + per-region widget placements |
| `nutmag-layout-mode` | Active layout mode (`graph` or `slots`) |
| `nutmag-theme` | Theme mode (`light`, `auto`, `dark`) |
| `nutmag-palette` | Active colour palette (`ember`, `slate`, `moss`, `plum`, `reef`, `raspberry`, `circuit`, `graphite`) |
| `nutmag-prefs` | Global prefs (polling, boot sequence) |
| `nutmag-sessions` | Session tracker (uptime stats) |

All keys are written immediately on change and read on mount. Corrupted or
missing keys fall back to sensible defaults automatically.
