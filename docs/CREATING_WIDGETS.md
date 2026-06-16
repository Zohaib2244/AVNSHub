# Creating a Widget

This guide is the single source of truth for adding a widget to AVN Hub. It is
written so that **any developer — or any LLM (e.g. the planned widget-creator
chat bot) — can add a fully working, resizable, rearrangeable widget by
following it literally.** No framework internals need to be touched.

> TL;DR — a widget is **one content component + one manifest entry**. Write the
> component, register it in [`config/widgets.tsx`](../config/widgets.tsx), add its
> id to `DEFAULT_ORDER`. The framework gives you the card chrome, the grid
> placement, resizing (S/M/L × horizontal/vertical), drag-to-rearrange in edit
> mode, the per-widget settings popover, and persistence — for free.

---

## The interaction model (what widgets do and don't do)

Widgets are **resizable** and **rearrangeable**. Slot Layout also has an
opt-in transient **Hover On Expand** visual preview: when a widget's
`slot hover expand` setting is enabled, the hovered widget gets a real larger
preview box, and only directly edge-touching neighbors get smaller preview
boxes. It does not persist layout, change a widget's configured size, open an
overlay, or start a neighbor cascade. A previous flyout/overlay/grow system was
removed after it caused reflow loops; do not reintroduce that style of
expansion.

A widget that wants to show more when it's bigger does so by **rendering
different markup per size** (see [Per-size UI](#per-size-ui-the-core-feature)).

---

## 1. Anatomy

```
config/widgets.tsx          ← the registry: WIDGETS map + DEFAULT_ORDER
components/<YourWidget>.tsx  ← your content component (data + markup only)
```

The content component renders **only the inside of the card** — no border, no
label, no fetch boilerplate. The shell
([`components/framework/WidgetShell.tsx`](../components/framework/WidgetShell.tsx))
wraps it with the sticker-card chrome and the label header.

---

## 2. Write the content component

```tsx
"use client";

import { useWidget } from "@/components/framework/WidgetContext";

export function WeatherWidget() {
  const { size, settings } = useWidget();

  // render different markup per size — this is how a widget gets a
  // distinct small / medium / large layout
  if (size === "S") {
    return <div className="block-value">72°</div>;
  }

  return (
    <>
      <div className="block-value accent">72° · sunny</div>
      <div className="block-sub">feels like 70°</div>
    </>
  );
}
```

Rules for the component:

- **`"use client"`** at the top if it uses hooks/state/effects (almost always).
- Render **markup only** — never write `.block`, `.capsule`, a label header, or
  any expansion markup. The shell owns all of that.
- Read placement + config through **`useWidget()`**, never via props:
  - `size` — `"S" | "M" | "L"`. Branch on it for per-size layouts.
  - `orientation` — `"h" | "v"`.
  - `settings` — your resolved settings values (see [Settings](#5-settings-optional)).
- Use the **shared helpers** instead of re-implementing them:
  - `usePolling<T>(url, intervalMs)` from `@/lib/usePolling` — shared per-URL
    cache + timer that honors the global polling pref. Use this for any data
    fetch; never hand-roll a `setInterval` fetch loop.
  - `timeAgo`, `formatDuration`, `formatMins` from `@/lib/format`.
- Reuse the **existing class vocabulary** so you inherit the theme automatically:
  `block-label`, `block-value` (`.accent` / `.teal`), `block-sub`, `block-stat`,
  `more-head`, `more-row` / `more-meta`. Add new classes to
  [`styles/globals.css`](../styles/globals.css) only when nothing fits, and use the
  CSS variables (`--text-primary`, `--accent-orange`, `--border`, …) — never
  hard-code colors.

---

## 3. Register the manifest

Add one entry to the `WIDGETS` object in
[`config/widgets.tsx`](../config/widgets.tsx):

```tsx
weather: {
  id: "weather",                 // MUST equal the object key — unique across the whole registry
  title: "weather",              // human name (card label + widget manager)
  icon: CloudSun,                // a lucide-react icon
  component: WeatherWidget,
  sizes: ["S", "M", "L"],        // which sizes are allowed (these are the resize limits)
  orientations: ["h", "v"],      // which shapes are allowed
  defaults: { size: "M", orientation: "h" },
  // settings: [...]             // optional, see below
  // detail: WeatherDetail       // optional, see below
  // flags: { ... }              // optional, see below
},
```

### Manifest fields

| Field | Required | Meaning |
|---|---|---|
| `id` | ✅ | **Unique** stable identifier. Equals the object key. Becomes the persistence key and the card's DOM id (`#weather`). Pick a short kebab-case slug. |
| `title` | ✅ | Display name shown as the card label and in the widget manager. |
| `icon` | ✅ | A `lucide-react` icon component. |
| `component` | ✅ | Your content component. |
| `sizes` | ✅ | Allowed size tiers. **This is the resize limit** — the settings popover only offers these. Order them small→large. |
| `orientations` | ✅ | Allowed shapes (`"h"` and/or `"v"`). One value = no shape toggle shown. |
| `defaults` | ✅ | `{ size, orientation, hidden? }` — the starting placement. `hidden: true` ships the widget off-screen (re-addable from the manager). |
| `detail` | — | A component auto-rendered **below** the main content **at L size only**. The cheapest way to add a rich large layout without size-branching the main component. |
| `settings` | — | Schema for the auto-generated per-widget settings form. |
| `flags` | — | `plainChrome` (no card chrome at all), `customHeader` (chrome but the component renders its own header), `accent` (orange left border), `className` (extra class on `.block`). |

### Size × orientation → grid span

`SPAN_MAP` fixes how each size/shape occupies the 6-column grid:

| | horizontal | vertical |
|---|---|---|
| **S** | 1×1 | 1×2 |
| **M** | 2×1 | 2×2 |
| **L** | 3×2 | 2×3 |

Only offer `sizes`/`orientations` your component actually looks good in. If
your S layout needs height, include `"S"` with `"v"`; if it's a single stat,
`"S"` + `"h"` (1×1) is right.

---

## 4. Add it to the default layout

Append the id to `DEFAULT_ORDER` at the bottom of
[`config/widgets.tsx`](../config/widgets.tsx). Order = initial grid placement
(dense auto-flow back-fills gaps). Omit it and the widget exists but never
appears by default (still add-able from the manager once it's in `DEFAULT_ORDER`
— so in practice, always add it).

```tsx
export const DEFAULT_ORDER: WidgetId[] = [
  "identity",
  // …
  "weather",   // ← here
];
```

That's the whole job. The widget is now draggable, resizable, hideable, and
configurable. TypeScript will error if the manifest shape is wrong.

---

## Per-size UI (the core feature)

Different sizes should feel like **purpose-built layouts**, not the same content
scaled. Two ways to do it:

### A. Branch on `size` in the component (full control)

```tsx
const { size } = useWidget();
if (size === "S") return <CompactView />;   // glanceable single value
if (size === "M") return <StandardView />;  // the default
return <RichView />;                         // L: more rows, controls, detail
```

Good examples already in the repo:
[`NowPlaying`](../components/NowPlaying.tsx) (S = art + title; M = full player; L
= player + recent tracks/queue) and
[`CurrentlyPlaying`](../components/CurrentlyPlaying.tsx).
[`NutBotFaceWidget`](../components/widgets/NutBotFaceWidget.tsx) is the extreme
case: S/M show the face, **L renders an entirely different component** (the
terminal).

### B. Declare a `detail` component (lowest effort)

If "bigger = the same card plus an extra detail list", export a second component
and set it as `detail`. The shell renders it below the main content **only at L
size**, inside a `.size-l-more` scroll area:

```tsx
export function WeatherWidget() { /* compact, used at all sizes */ }
export function WeatherDetail() {
  return (
    <>
      <div className="more-head">hourly</div>
      {/* more-row items… */}
    </>
  );
}
```

```tsx
// manifest
weather: { /* … */ component: WeatherWidget, detail: WeatherDetail, sizes: ["S","M","L"] },
```

Most data widgets (homelab, jellyfin, arr-stack, github, …) use pattern B — the
`*Detail`/`*More` export is just the L-size detail.

> Whichever you pick: a widget with a `detail` or an L-only layout **must include
> `"L"` in `sizes`**, or the user can never reach it.

### C. CSS hook

The card element carries `data-size="S|M|L"` and is a named inline-size
container (`container-name: widget`). Target `data-size` for size-specific
styling and use container queries when a layout needs to adapt to the card's
actual rendered width:

```css
.capsule[data-size="S"] .my-thing { display: none; }

@container widget (max-width: 190px) {
  .my-control-row { flex-direction: column; }
}
```

### D. Sizing & overflow

Slot Layout lets users choose region grids, so the same S/M/L markup can render
in cells that are much narrower or shorter than the old fixed span presets.
Keep compact layouts resilient:

- Rows of buttons, pills, badges, or segmented controls should wrap instead of
  assuming one horizontal line.
- Label + control rows should stack under narrow `@container widget (...)`
  breakpoints.
- Test the S layout at the narrowest configured cell before shipping; if it
  clips, shrink the compact chrome or branch to simpler S markup.
- If the widget has useful hidden detail on hover, test it with the per-widget
  `slot hover expand` setting enabled in Slot Layout and keep the expanded
  state readable without relying on an overlay.

---

## 5. Settings (optional)

Add a `settings` schema and the per-widget gear popover renders the form
automatically; values arrive in `useWidget().settings`.

```tsx
settings: [
  { key: "units",   label: "units",        type: "select", default: "f",
    options: [{ value: "f", label: "°F" }, { value: "c", label: "°C" }] },
  { key: "showHum", label: "humidity",     type: "toggle", default: true },
  { key: "city",    label: "city",         type: "text",   default: "", placeholder: "auto" },
  { key: "days",    label: "forecast days",type: "number", default: 3, min: 1, max: 7 },
],
```

Field types: `toggle` (boolean), `select` (string + `options`), `text`
(string), `number` (number + optional `min`/`max`). Read them back type-safe:
`const units = String(settings.units);`. Unknown/ill-typed stored values fall
back to the field default automatically.

---

## Identity & persistence (how the backend tracks a widget)

- **`id` is the identity.** It's the `WIDGETS` key, the layout/persistence key in
  `localStorage["nutmag-layout"]`, and the card's DOM `id`. It must be unique and
  stable — renaming it orphans saved layouts for existing users (the sanitizer
  drops unknown ids and re-adds defaults, so nothing breaks, but per-user config
  for the old id is lost).
- **`title` is the label.** Change it freely; it's cosmetic.
- The layout store ([`lib/layout.ts`](../lib/layout.ts)) persists every instance as
  `{ id, size, orientation, hidden, settings }`. Its `sanitize()` clamps stored
  values to what your manifest currently allows, drops unknown ids/settings, and
  appends any newly-registered widgets — so adding, removing, or re-scoping a
  widget never corrupts a saved layout.

---

## Showing / hiding & the widget manager

Visibility is just the instance's `hidden` flag. Users add/remove widgets from
the **widget manager** ([`components/widgets/WidgetManager.tsx`](../components/widgets/WidgetManager.tsx)),
which lists on-screen widgets (removable) and available/hidden widgets
(add-able). You don't wire anything up — any registered widget appears there
automatically. To programmatically toggle one:
`updateInstance(id, { hidden: true | false })` from `useLayout()`.

The manager itself can never be hidden (`ALWAYS_VISIBLE` in `lib/layout.ts`), so
there is always a way to bring widgets back.

---

## Checklist

- [ ] Component is `"use client"`, renders markup only, reads `useWidget()`.
- [ ] Distinct layout per declared size (branch on `size`, and/or a `detail`).
- [ ] `id` is unique kebab-case and equals the `WIDGETS` key.
- [ ] `sizes` includes `"L"` if there's an L-only layout or a `detail`.
- [ ] Data fetched via `usePolling`, not a hand-rolled loop.
- [ ] Colors/spacing use CSS variables / existing classes — no hard-coded hex.
- [ ] Added to `DEFAULT_ORDER`.
- [ ] `npx tsc --noEmit` and `npx eslint` are clean.

---

## Don't

- ❌ Re-introduce hover/click flyouts, overlay modals, persisted hover layout,
  or neighbor-cascading expansion; dense grid re-measure loops can hit
  "Maximum update depth exceeded".
- ❌ Render `.block`/`.capsule`/label markup inside the component.
- ❌ Fetch with a bare `setInterval` — use `usePolling`.
- ❌ Hard-code colors or fonts — use the theme tokens.
- ❌ Reuse an existing `id`, or rename an `id` casually.
- ❌ Attach `framer-motion layout` or dnd-kit `animateLayoutChanges` to grid
  items — dense grid reflow + per-item re-measure loops into
  "Maximum update depth exceeded". (Movement is span growth + grid reflow only.)
