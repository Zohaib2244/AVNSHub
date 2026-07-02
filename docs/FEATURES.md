# Feature Tour

AVN Hub is a customizable widget canvas for live data, tiny tools, generated experiments, identity cards, control panels, visual toys, and whatever else belongs on your personal dashboard.

---

## Dashboard Canvas

The main view is a living canvas with left and right widget regions, a base strip, and a fixed center terminal slot for NutBot. Widgets are placed manually in Slot Layout, then resized and repositioned in edit mode.

![AVN Hub dark mode canvas](<screenshots/display dark mode.png>)

![AVN Hub light mode canvas](<screenshots/display light mode.png>)

---

## NutBot v2.3

NutBot lives in the center terminal slot. The terminal is a single combined header bar — title label, four tabs, and controls all in one row.

![NutBot terminal v2.2 — tab bar close-up](<screenshots/nutbot-terminal-v2.2.png>)

### Tabs

| Tab | What it does |
| --- | --- |
| `◈ log` | Ambient dashboard status ticker |
| `◎ chat` | Conversational NutBot backed by Bonfire/local LLM or CLI harness fallback |
| `⌨ shells` | Real host pseudo-terminal sessions with sidebar navigation |
| `✦ creator` | AI-assisted custom widget generation |

### NutBot Chat

The chat tab gives NutBot a conversational personality. It connects to a self-hosted Bonfire instance (local LLM) if available, then falls back through the shared CLI harness chain (Claude, Codex, Opencode). See [NUTBOT_CHAT_SETUP.md](NUTBOT_CHAT_SETUP.md) for backend setup.

![NutBot chat tab](<screenshots/nutbot-chat.png>)

### NutBot Shells

The shells tab is its own screen with a sidebar listing mounted terminal sessions. Sessions stay mounted (`display: none` while inactive) so the pty and scrollback survive tab switching. Use `+ new` to open additional shell panes.

![NutBot shells tab with sidebar](<screenshots/nutbot-shells.png>)

### Model Picker

The unified model picker in the top-right of the terminal controls which backend both Chat and Widget Creator use. Selecting a model here sets it for both tabs simultaneously.

| Dot color | Backend |
| --- | --- |
| Orange | Bonfire (local LLM) |
| Cyan | claude CLI |
| Purple | codex CLI |
| Green | opencode CLI |

![NutBot model picker dropdown](<screenshots/nutbot-model-picker.png>)

---

## Widget Creator

NutBot's `✦ creator` tab scaffolds brand-new widgets from a single prompt. The builder uses token-optimized prompt loading and compact skill references so large authoring guidance stays lightweight and fast. The project list front page has a hero banner for starting new widgets, pipeline stage chips showing each project's progress, and section counts separating in-progress from created widgets.

![Widget Creator project list](<screenshots/widget-creator-project-list.png>)

### Pipeline Stages

A project moves through up to three stages:

| Stage | What happens |
| --- | --- |
| **Plan** | Chat with AI to figure out what to build — concept suggestions, structured brief, data shape |
| **Ideate** | HTML/CSS mockups rendered live for each variation; regenerate or finalize one as the build reference |
| **Build** | AI writes the real `.tsx` component; TypeScript-checked before registering; rolls back on failure |

![Widget Creator workspace — build mode](<screenshots/widget-creator-workspace.png>)

### Generation Lock

While the AI is generating in build mode, the settings panel on the left is locked (dimmed, non-interactive) so settings can't change mid-build. The back button is also disabled.

### Canvas Switch Protection

If you try to switch canvases while a widget is generating, AVN Hub shows a native-styled confirmation dialog asking whether to cancel the build and switch. Switching canvas aborts the active generation cleanly.

![Canvas switch confirmation dialog](<screenshots/canvas-switch-dialog.png>)

---

## Widget Keyboard Focus

Widgets that use keyboard input (cube timer, Wordle, and any generated widget that reads keys) only capture keyboard events when the widget is **actively focused** — that is, when the user has clicked it.

- **Click a widget** → orange border lights up; the widget now owns keyboard input
- **Click outside / press Escape** → focus clears; keyboard input returns to the page

This prevents unintended triggers — typing in NutBot chat no longer accidentally starts/stops the cube timer.

![Widget keyboard focus — orange border indicator](<screenshots/widget-keyboard-focus.png>)

---

## Custom Widgets

Widgets are the primary unit of expression. A widget can be a live integration, personal stat, generated mini-app, dashboard control, or completely custom interface.

Once registered, every widget gets framework behavior automatically:

- Placement in Slot Layout
- Drag-to-reposition in edit mode
- Edge-handle resizing
- Per-size layouts for small, medium, and large views
- Per-widget settings
- Optional Hover On Expand previews
- Keyboard focus gating via `isFocused` from `useWidget()`
- Local persistence

NutBot can generate widgets in the `creator` tab (see [WIDGET_CREATOR_GUIDE.md](WIDGET_CREATOR_GUIDE.md) for a full walkthrough), or write them manually with [CREATING_WIDGETS.md](CREATING_WIDGETS.md).

---

## Slot Grid And Edit Mode

The dashboard is a three-region slot grid: left column, right column, and base strip. In edit mode you can:

- Drag widgets with the move handle.
- Resize widgets with edge handles.
- Configure each widget through its gear menu.
- Add widgets from empty cells or the Widget Manager.
- Remove widgets back to the available pool.

![Edit mode with resize handles and empty add slots](<screenshots/edit mode.png>)

---

## Hover On Expand

Hover On Expand is an opt-in transient preview. Hovering over a widget lets it show a larger version in place while directly edge-touching neighbors temporarily contract. It does not save layout changes and it is disabled in edit mode, on touch pointers, and while resizing or moving.

![Hover On Expand preview](<screenshots/expandable widgets.png>)

---

## Hub Core

Hub Core is the fixed control strip on the edge of the canvas:

- **Wrench/lock** — toggle edit mode.
- **Settings** — theme, palette, wallpaper, backdrop, preferences, layout reset, region grid size, canvas management, import/export.
- **Widget Manager** — add, remove, import, export, and delete custom widgets.

![AVN Hub Hub Core settings panel](<screenshots/hub-core-settings.png>)

---

## AVN Hub Canvases

Canvases are named contexts such as home, work, or entertainment. Each canvas has its own:

- Widget arrangement
- Theme mode
- Palette
- Wallpaper
- Backdrop settings

Switching canvases re-skins the whole card, not just the grid.

**Managing canvases:** click a pill to switch; double-click to open the rename/icon flyout. Create new canvases with the `+` pill. The full canvas list is also accessible from the Hub Core settings accordion.

![Canvas pill stack and manage flyout](<screenshots/canvas-management.png>)

![Canvas management in Hub Core settings](<screenshots/canvas-settings-accordion.png>)

---

## Themes And Palettes

Dark and light modes are both first-class. Palette packs include ember, slate, moss, plum, reef, raspberry, circuit, and graphite. Theme and palette are persisted and applied before paint to avoid a flash of the wrong theme.

![AVN Hub palette picker in Hub Core](<screenshots/all the color options.png>)

![AVN Hub sea green palette example](<screenshots/display with sea green color.png>)

---

## Wallpaper And Personalization

Personalization uses three independent layers, each set per-canvas:

| Layer | What it is |
| --- | --- |
| **BG wallpaper** | Optional image or looping video stored in IndexedDB, full-bleed behind everything |
| **Canvas backdrop** | The bezel holding the grid — solid, blur, transparent, or glass |
| **Widget backdrop** | Every widget card — solid, blur, transparent, or glass — a global default with per-widget override |

`glass` mode gives a Liquid-Glass-style frosted read: more transparent fill, stronger blur + saturate so colors behind don't wash out, and (canvas only) an inset top-edge highlight for the glossy rim-light. Mouse parallax is optional.

![Wallpaper and backdrop settings](<screenshots/wallpaper-backdrop-settings.png>)

---

## Widget Manager

The Widget Manager lists placed widgets and available widgets, supports search and filters, imports/exports widgets as zip files, and lets custom widgets created by NutBot appear alongside bundled examples.

![Widget manager](<screenshots/widget manager.png>)

---

## Bundled Example Widgets

Bundled widgets make the hub useful immediately and serve as reference implementations:

- Identity card, clock/date
- Spotify / now playing
- Homelab status and host telemetry (CPU, disk, network)
- GitHub activity
- Notes, dictionary, and dot matrix
- NutBot face and terminal

They are examples, not the limit of the system.
