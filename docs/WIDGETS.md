# Writing a widget

A widget is **one content component plus one manifest**. The framework supplies the card chrome, grid placement, resizing, drag-to-rearrange, the settings popover, and persistence. Never hand-roll `.block` markup or fetch loops inside a widget.

There are three ways to add one:

| Path | Use it for | Files |
| --- | --- | --- |
| **Core** | Widgets shipped with the hub | component + entry in `config/widgets.tsx` |
| **Custom** | What the Widget Creator generates; easiest by hand too | `components/widgets/custom/<slug>/` (component + `manifest.json`) |
| **Iframe** | A single HTML file, no React, no rebuild | `public/custom-widgets/<id>/index.html` + a registry entry |

The in-app [Widget Creator](WIDGET_CREATOR.md) uses the Custom path. Its agent follows its own prompt (`lib/widget-creator/prompts/widget-build-spec.md`), not this page.

## The component

```tsx
"use client";
import { useWidget } from "@/components/framework/WidgetContext";

export function WeatherWidget() {
  const { size, orientation, settings, isFocused } = useWidget();
  if (size === "S") return <div className="block-value">72°</div>;
  return (
    <>
      <div className="block-value accent">72° · sunny</div>
      <div className="block-sub">feels like 70°</div>
    </>
  );
}
```

- Add `"use client"`. Render markup only; the shell owns the card and its label header.
- Read placement and config through `useWidget()`, never props: `size` (`"S" | "M" | "L"`), `orientation` (`"h" | "v"`), `settings`, `isFocused`.
- Fetch with `usePolling<T>(url, intervalMs)` from `@/lib/usePolling` (shared per-URL cache and timer, honours the global polling pref). Formatters are in `@/lib/format` (`timeAgo`, `formatDuration`, `formatMins`).
- Use the existing classes (`block-label`, `block-value` with `.accent` / `.teal`, `block-sub`, `block-stat`, `more-head`, `more-row`) and CSS variables (`--text-primary`, `--accent-orange`, `--border`). Never hard-code colours or fonts.
- External APIs go through a route in `app/api/`; never put keys in client code.

## Core manifest

Add an entry to `WIDGETS` in `config/widgets.tsx`, then append the id to `DEFAULT_ORDER`:

```tsx
weather: {
  id: "weather",                 // must equal the key; unique; becomes the persistence key and DOM id
  title: "weather",
  icon: CloudSun,                // lucide-react
  component: WeatherWidget,
  sizes: ["S", "M", "L"],        // the resize limits
  orientations: ["h", "v"],
  defaults: { size: "M", orientation: "h" },
},
```

| Field | Meaning |
| --- | --- |
| `sizes`, `orientations` | What the user can resize to. Order sizes small to large. One orientation hides the shape toggle. |
| `defaults` | Starting placement. `hidden: true` ships it off-screen, re-addable from the manager. |
| `minPx` | `{ width, height }` floor in px for Slot Layout; drag-resize stops there. |
| `detail` | Component auto-rendered below the content at L only. |
| `settings` | Schema for the auto-generated settings form (below). |
| `flags` | `plainChrome` (no card), `customHeader` (you render the header), `accent` (orange left border), `className`. |

The `id` is the widget's identity. Renaming it orphans saved per-user config for the old id; the layout sanitizer drops unknown ids and re-adds defaults, so nothing breaks.

## Per-size layouts

Widgets show more when bigger by rendering **different markup per size**. Either branch on `useWidget().size`, or export a second component as `detail` for "the same card plus an extra list" at L. A widget with an L-only layout or a `detail` must list `"L"` in `sizes`. CSS can target `.capsule[data-size="S"]` or `@container widget (max-width: 190px)`.

In Slot Layout the tier comes from the cell's measured pixel box, not its span:

- **S** - narrower than 300px or shorter than 150px
- **L** - at least 600x250 or 400x400
- **M** - everything in between

The user can also pin a size from the gear popover, so an L layout may land in a small cell. Let it clip cleanly instead of breaking.

**S has a small height budget** (about 65-90px of content). `.block` clips overflow, and vertically-centred content clips off both ends. Use the proven 3-line pattern: `block-label`, one `block-stat`, one `block-sub`. No interactive rows at S. Other tips: give text and input children `min-width: 0`, let rows of buttons wrap, use auto-growing textareas, and test S at the narrowest cell.

Graph Layout spans, for reference: S 1x1 (v 1x2), M 2x1 (v 2x2), L 3x2 (v 2x3) on a 6-column grid.

## Settings

A `settings` array renders a form in the gear popover; values arrive in `useWidget().settings`.

```tsx
settings: [
  { key: "units", label: "units", type: "select", default: "f",
    options: [{ value: "f", label: "°F" }, { value: "c", label: "°C" }] },
  { key: "showHum", label: "humidity", type: "toggle", default: true },
  { key: "city", label: "city", type: "text", default: "", placeholder: "auto" },
  { key: "days", label: "days", type: "number", default: 3, min: 1, max: 7 },
],
```

Types are `toggle`, `select`, `text` and `number`. Ill-typed stored values fall back to the default.

## Keyboard input

Gate every `keydown`/`keyup` listener on `isFocused`, so the widget never steals keys from NutBot chat or another widget. Users focus a widget by clicking it; clicking the canvas, pressing `Escape` or entering edit mode clears focus. Add `isFocused` to the effect's dependency array.

```tsx
useEffect(() => {
  if (!isFocused) return;
  const onKey = (e: KeyboardEvent) => { /* ... */ };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [isFocused]);
```

## Saving your own data

Small config belongs in `settings`. Real user data (notes, todo lists, saved links) must **not** go straight to `localStorage`: the hub has multiple canvases and syncs to a host database, and a bare key is global and stuck in one browser. Use `@/lib/canvasStore`, which namespaces per canvas and syncs to the database:

```tsx
import { useCanvasSyncedState } from "@/lib/canvasStore";

const [items, setItems, hydrated] = useCanvasSyncedState("my-widget-items", () => [], sanitize);
```

`sanitize(raw)` must return `null` for anything malformed, so a corrupt value can't crash the widget. For data shared outside React, use `createCanvasStore` (see `components/widgets/default/notes`).

## Custom widgets

Two files in their own folder:

```text
components/widgets/custom/<slug>/<Pascal>Widget.tsx   # named export, e.g. cube-timer -> CubeTimerWidget
components/widgets/custom/<slug>/manifest.json
```

```json
{
  "title": "cube timer",
  "iconName": "Box",
  "sizes": ["S", "M", "L"],
  "orientations": ["h"],
  "defaults": { "size": "M", "orientation": "h" },
  "settings": [{ "key": "showStats", "label": "show stats", "type": "toggle", "default": true }]
}
```

`iconName` is a PascalCase lucide icon name as a string. Registration into `config/customRegistry.json` and `config/customComponentMap.tsx` happens automatically after the files are written, so don't hand-edit them or anything else under `config/`, `lib/`, `app/` or `components/framework/`. Importing read-only helpers (`@/lib/usePolling`, `@/lib/format`, `@/lib/canvasStore`) is fine.

There is no sibling CSS file. Style with inline `CSSProperties` and tokens (`var(--font-jetbrains-mono)`, `var(--font-dot-gothic)`, `var(--text-primary)`), plus the shared classes. `settings` is an untyped `Record<string, string | number | boolean>`, so narrow before use. Write plain ASCII in source. See `components/widgets/custom/cube-timer/` and `glyph-matrix/` for working examples.

## Iframe widgets

For content with no React at all, put one HTML file at `public/custom-widgets/<id>/index.html` and add an entry to `config/customRegistry.json`:

```json
"my-widget": {
  "type": "iframe",
  "title": "My Widget",
  "iconName": "Box",
  "sizes": ["S", "M", "L"],
  "orientations": ["h"],
  "defaults": { "size": "M", "orientation": "h" }
}
```

It appears in the Widget Manager with no rebuild. The iframe receives theme tokens, size and settings from the host and can report its height; see `lib/widget-creator/prompts/widget-build-spec.md` for the message protocol.

## Don't

- Re-add hover/click flyouts, overlays or neighbour-cascading expansion. A previous system caused reflow loops.
- Attach framer-motion `layout` or dnd-kit `animateLayoutChanges` to grid items. Dense grid reflow plus per-item re-measure loops into "Maximum update depth exceeded".
- Render `.block` / `.capsule` / label markup inside a component.
- Fetch with a bare `setInterval`; use `usePolling`.
- Reuse or casually rename an `id`.

## Checklist

- [ ] `"use client"`, markup only, reads `useWidget()`
- [ ] A distinct layout per declared size; `"L"` listed if there's a `detail`
- [ ] Unique kebab-case `id`
- [ ] Data via `usePolling` / `canvasStore`, colours from variables
- [ ] Added to `DEFAULT_ORDER` (core path)
- [ ] `npx tsc --noEmit` and `npm run lint` clean
