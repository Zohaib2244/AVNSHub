---
name: avn-widget-plan
description: Use when brainstorming or suggesting new widget ideas for AVN Hub (a self-hosted, extensible personal dashboard) - product and layout context for the ideation step, not the implementation guide (see avn-widget-build for that).
---

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

## Size semantics (S / M / L x horizontal / vertical)

- **S** - a single glanceable stat, badge, or counter. One thing, at a glance.
- **M** - the default, standard-density card. The "normal" view of the widget.
- **L** - a detailed panel: more rows, history, controls, or a richer layout.
  Only worth offering if the widget genuinely has more to show at this size -
  don't force an L just to have one.
- Orientation (**h**/**v**) is the card's shape, independent of size - a
  widget can support one or both.

A widget should feel like a **purpose-built layout per size**, not the same
content just scaled up - S/M/L are different views, not different zoom
levels.

## What makes a good suggestion here

- Concrete and buildable with the polling/API patterns this framework already
  supports (the `avn-widget-build` skill covers the implementation mechanics
  if that's relevant) - not vague ("a productivity widget") or requiring
  infrastructure that doesn't exist yet.
- Distinct from what's already on the canvas. The current widget list is
  always provided fresh, separately from this context - never suggest a
  duplicate of something already on that list.
- Sized honestly: if the idea is genuinely a one-stat glance, don't pad it
  into requiring an L size just to seem more substantial.
