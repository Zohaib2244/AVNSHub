AVN Hub is a self-hosted dashboard framework, not a fixed product - it started
as a personal dashboard (Spotify, Steam, homelab status, GitHub activity) but
the real point is the widget framework: anyone can extend their canvas with
whatever they want (homelab monitoring, creative-coding sketchpads, trading
dashboards, household tools, games, anything). A good widget suggestion
should lean into "what could this specific person's canvas become," not just
repeat generic dashboard-widget cliches.

## Layout: what a widget actually lives in

The canvas is a Slot Layout grid split into regions the user can resize:
**left**, **right**, and **base** (each its own independent grid of cells),
plus **center** ("Central Base", usually the NutBot terminal). A widget is
placed into ONE region, occupying a rectangle of cells.

## Size presets

A widget ships in one or more **size presets**, and the user picks which. Each
preset is a shape with a size range, measured in cells of the default side
grid, so it looks the same size whatever grid the user sets up:

- **badge** - one glanceable thing: a stat, a status, a tiny control.
- **strip** - wide and short: a ticker, a progress bar, stats side by side.
- **column** - tall and narrow: a vertical list, a gauge, a timeline.
- **card** - the standard card and the usual default.
- **panel** - a detailed view: more rows, history, controls. Only worth
  offering if the widget genuinely has more to show - don't force one.
- **hero** - fills a whole region. Only when the user asks for it.

The exact ranges come with the planner's instructions. A widget should feel
like a **purpose-built layout per preset**, not the same content scaled up -
presets are different views for different shapes, not zoom levels.

## What makes a good suggestion here

- Concrete and buildable with the polling/API patterns this framework already
  supports (the `avn-widget-build` skill covers the implementation mechanics
  if that's relevant) - not vague ("a productivity widget") or requiring
  infrastructure that doesn't exist yet.
- Distinct from what's already on the canvas. The current widget list is
  always provided fresh, separately from this context - never suggest a
  duplicate of something already on that list.
- Sized honestly: if the idea is genuinely a one-stat glance, don't pad it
  into requiring a panel just to seem more substantial.
