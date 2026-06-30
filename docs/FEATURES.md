# Feature Tour

AVN Hub is a customizable widget canvas for live data, tiny tools, generated experiments, identity cards, control panels, visual toys, and whatever else belongs on your personal dashboard.

## Dashboard Canvas

The main view is a living canvas with left and right widget regions, a base strip, and a fixed center terminal slot for NutBot. Widgets are placed manually in Slot Layout, then resized and repositioned in edit mode.

![AVN Hub dark mode canvas](<screenshots/display dark mode.png>)

![AVN Hub light mode canvas](<screenshots/display light mode.png>)

## Custom Widgets

Widgets are the primary unit of expression. A widget can be a live integration, personal stat, generated mini-app, dashboard control, or completely custom interface.

Once registered, every widget gets framework behavior automatically:

- Placement in Slot Layout
- Drag-to-reposition in edit mode
- Edge-handle resizing
- Per-size layouts for small, medium, and large views
- Per-widget settings
- Optional Hover On Expand previews
- Local persistence

NutBot can generate widgets in the `CREATOR` tab, or you can write them manually with [CREATING_WIDGETS.md](CREATING_WIDGETS.md).

## NutBot

NutBot lives in the center terminal slot and has several tabs:

- `log`: ambient dashboard status ticker
- `chat`: optional conversational NutBot, backed by Bonfire/local LLM or CLI harness fallback
- `shell`: real host pseudo-terminal sessions
- `creator`: AI-assisted custom widget generation

![NutBot Widget Creator close-up](<screenshots/Widget Creator.png>)

## Slot Grid And Edit Mode

The dashboard is a three-region slot grid: left column, right column, and base strip. In edit mode you can:

- Drag widgets with the move handle.
- Resize widgets with edge handles.
- Configure each widget through its gear menu.
- Add widgets from empty cells or the Widget Manager.
- Remove widgets back to the available pool.

![Edit mode with resize handles and empty add slots](<screenshots/edit mode.png>)

## Hover On Expand

Hover On Expand is an opt-in transient preview. Hovering over a widget lets it show a larger version in place while directly edge-touching neighbors temporarily contract. It does not save layout changes and it is disabled in edit mode, on touch pointers, and while resizing or moving.

![Hover On Expand preview](<screenshots/expandable widgets.png>)

## Hub Core

Hub Core is the fixed control strip on the edge of the canvas:

- Wrench/lock: toggle edit mode.
- Settings: theme, palette, preferences, layout reset, region grid size, import/export.
- Widget Manager: add, remove, import, export, and delete custom widgets.

![AVN Hub Canvas Settings](<screenshots/AVN Hub Canvas Settings.png>)

## AVN Hub Canvases

Canvases are named contexts such as home, work, or entertainment. Each canvas has its own:

- Widget arrangement
- Theme mode
- Palette
- Wallpaper
- Backdrop settings

Switching canvases re-skins the whole card, not just the grid.

## Themes And Palettes

Dark and light modes are both first-class. Palette packs include ember, slate, moss, plum, reef, raspberry, circuit, and graphite. Theme and palette are persisted and applied before paint to avoid a flash of the wrong theme.

![AVN Hub sea green palette](<screenshots/display with sea green color.png>)

![Hub Core palette options](<screenshots/all the color options.png>)

## Wallpaper And Personalization

Personalization uses three layers:

- BG wallpaper: optional image or looping video stored in IndexedDB.
- Canvas backdrop: solid, blur, or transparent.
- Widget backdrop: independent solid, blur, or transparent default, with per-widget override.

Mouse parallax is optional. Ambient Sound can synthesize rain, wind, drone, and room-tone presets, or play uploaded looping clips.

## Widget Manager

The Widget Manager lists placed widgets and available widgets, supports search and filters, imports/export widgets as zip files, and lets custom widgets created by NutBot appear alongside bundled examples.

![Widget manager](<screenshots/widget manager.png>)

## Bundled Example Widgets

Bundled widgets make the hub useful immediately and serve as reference implementations:

- Identity card, clock/date
- Spotify/now playing
- Steam/currently playing
- Homelab status and host telemetry
- GitHub activity
- Ambient Sound
- NutBot face and terminal

They are examples, not the limit of the system.
