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

```text
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
  title: "weather",              // human name (card label + Hub widget controls)
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
| --- | --- | --- |
| `id` | ✅ | **Unique** stable identifier. Equals the object key. Becomes the persistence key and the card's DOM id (`#weather`). Pick a short kebab-case slug. |
| `title` | ✅ | Display name shown as the card label and in Hub widget controls. |
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
| --- | --- | --- |
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

## 6. Keyboard input (optional)

If your widget captures keyboard events (space, arrow keys, letter keys, etc.),
gate every listener on `isFocused` from `useWidget()`. This prevents your widget
from stealing keystrokes when the user is typing in NutBot chat, the Hub Core
search field, or any other widget.

```tsx
const { size, isFocused } = useWidget();

useEffect(() => {
  if (!isFocused) return; // only capture keys when the user has clicked this widget
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      e.preventDefault();
      // start/stop timer, submit guess, etc.
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [isFocused]);
```

**How it works:**

- `isFocused` is `true` when the user has clicked this widget's card; `false`
  otherwise.
- The user **clicks the widget** to give it keyboard focus — a subtle orange
  border appears on the card to confirm.
- **Clicking outside any widget** (on the canvas background) or pressing
  `Escape` clears keyboard focus.
- Entering edit mode also clears keyboard focus.

Add `isFocused` to the `useEffect` dependency array so the listener
registers/unregisters cleanly when focus changes.

**Checklist addition for keyboard widgets:**

- [ ] All `window.addEventListener("keydown"/"keyup"/"keypress")` calls are
  gated with `if (!isFocused) return;` at the top of the handler.
- [ ] `isFocused` is in the `useEffect` dependency array.

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

## Showing / hiding & Hub widget controls

Visibility is just the instance's `hidden` flag. Users add/remove widgets from
the **Hub Core Widget Manager tab**, which lists on-screen/placed widgets and
available widgets. Slot Layout add actions ask for a target region and only
offer regions that currently have enough free cells. You don't wire anything
up — any registered widget appears there automatically. To programmatically toggle one:
`updateInstance(id, { hidden: true | false })` from `useLayout()`.

Slot Layout uses `placeWidget(id, region)` / `removeWidget(id)` from
`lib/slotLayout.ts`; Graph Layout uses the `hidden` flag above. Widgets placed
in Slot Layout's terminal slot keep their own persisted settings and expose
the same settings gear while edit mode is active.

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

## Custom widgets (split registry — what the in-app Widget Creator generates)

This is a **separate, simpler path** from the `config/widgets.tsx` pattern above
— used by the in-app NutBot Widget Creator (and anyone hand-adding a widget
without editing core config). A custom widget is **two files in their own
folder**, nothing else:

```text
components/widgets/custom/<slug>/<Pascal>Widget.tsx   ← the component
components/widgets/custom/<slug>/manifest.json         ← the manifest, as data
```

`<slug>` is kebab-case (e.g. `cube-timer`). `<Pascal>Widget` is the PascalCase
slug + `Widget` (e.g. `cube-timer` → `CubeTimerWidget`), exported as a **named
export** matching the file basename: `export function CubeTimerWidget() { ... }`.

Registration into `config/customRegistry.json` (data) and
`config/customComponentMap.tsx` (the one `React.lazy` line + map entry) happens
**automatically** after these two files are written — never hand-edit those two
files or any file under `config/`, `lib/`, `app/`, `components/framework/`, or
`components/widgets/default/` when authoring a custom widget. Touching them can
break the core hub or get overwritten by the next registration pass.

Two real examples already in the repo to copy conventions from:
[`components/widgets/custom/glyph-matrix/`](../components/widgets/custom/glyph-matrix/)
and
[`components/widgets/custom/cube-timer/`](../components/widgets/custom/cube-timer/).

### `manifest.json` shape

```json
{
  "title": "cube timer",
  "iconName": "Box",
  "sizes": ["S", "M", "L"],
  "orientations": ["h"],
  "defaults": { "size": "M", "orientation": "h" },
  "settings": [
    { "key": "showStats", "label": "show stats", "type": "toggle", "default": true }
  ]
}
```

- `iconName` — a `lucide-react` icon name as a **string**, PascalCase (not the
  imported component itself — there's no import in this file).
- `settings` — same field shapes as the `config/widgets.tsx` settings schema
  (`toggle` / `select` / `text` / `number`); use `[]` if there are none.
- Everything else matches the manifest fields described earlier in this guide.

### Styling: no sibling CSS file — use inline styles + CSS variables

Custom widgets don't get a `.css` import wired up automatically, so style with
`CSSProperties` objects (or inline `style={{ ... }}`) reading the same design
tokens as the rest of the app — **never hard-code hex or font names**. The two
font variables, exactly as defined in `app/layout.tsx`:

```tsx
const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const labelStyle: CSSProperties = {
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
};
```

You can still use the shared class vocabulary (`block-value`, `block-sub`,
`more-head`, `more-row`, …) from `styles/globals.css` alongside inline styles —
they work the same as in any other widget.

### `useWidget()` in a custom widget

Same hook, same shape as elsewhere: `{ id, size, orientation, settings, isFocused }`.
`settings` is an untyped bag — `Record<string, string | number | boolean>` —
resolved from your manifest's `settings` schema. Narrow before use:

```tsx
const { size, settings } = useWidget();
const showStats = settings.showStats !== false;                 // toggle, default true
const length = typeof settings.scrambleLength === "number" ? settings.scrambleLength : 20; // number
```

### Minimal complete example

This is the whole spec in one copy-pasteable shape — a tiny tally-counter
widget. Nothing here needs inferring from other files:

```tsx
// components/widgets/custom/tally-counter/TallyCounterWidget.tsx
"use client";

import { type CSSProperties, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
};
const buttonStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontFamily: "var(--font-dot-gothic), monospace",
  padding: "4px 10px",
};

export function TallyCounterWidget() {
  const { size, settings } = useWidget();
  const step = typeof settings.step === "number" ? settings.step : 1;
  const [count, setCount] = useState(0);

  return (
    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 8, height: "100%", justifyContent: "center" }}>
      <div style={labelStyle}>tally</div>
      <div className="block-value" style={{ ...monoStyle, fontSize: size === "S" ? "1.6rem" : "2.2rem" }}>
        {count}
      </div>
      {size !== "S" && (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setCount((c) => c - step)} style={buttonStyle} type="button">-{step}</button>
          <button onClick={() => setCount((c) => c + step)} style={buttonStyle} type="button">+{step}</button>
        </div>
      )}
    </div>
  );
}
```

```json
// components/widgets/custom/tally-counter/manifest.json
{
  "title": "tally counter",
  "iconName": "Plus",
  "sizes": ["S", "M", "L"],
  "orientations": ["h"],
  "defaults": { "size": "M", "orientation": "h" },
  "settings": [
    { "key": "step", "label": "step size", "type": "number", "default": 1, "min": 1, "max": 100 }
  ]
}
```

That's the full pattern — component + manifest, styled with CSS variables and
the two font tokens, settings narrowed from the untyped bag, branching on
`size`. **You don't need to open files under other `components/widgets/custom/*`
folders to figure out conventions — this guide is the complete spec.** (The
cube-timer and glyph-matrix widgets are real shipped examples if you want extra
reference, not required reading.)

### Canvas / animated widgets

For anything drawn frame-by-frame — waveforms, physics sims, visualizers —
the pattern below is the complete spec, already TypeScript-strict-null-safe.
You don't need to read `verlet-sim` or any other canvas widget's code to
find this; copy it directly:

```tsx
import { startAnimationLoop } from "@/lib/animationLoop";

const canvasRef = useRef<HTMLCanvasElement | null>(null);
const stageRef = useRef<HTMLDivElement | null>(null); // wrapper div, sized by CSS flex/grid

function readVar(el: HTMLElement, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}
function readPalette(el: HTMLElement) {
  return {
    accent: readVar(el, "--accent-orange", "CanvasText"),
    teal: readVar(el, "--accent-cyan", "CanvasText"),
    primary: readVar(el, "--text-primary", "CanvasText"),
    muted: readVar(el, "--text-muted", "CanvasText"),
    border: readVar(el, "--border", "CanvasText"),
    bg: readVar(el, "--bg-nested", "Canvas"),
  };
}

useEffect(() => {
  const canvas = canvasRef.current;
  const stage = stageRef.current;
  const context = canvas?.getContext("2d");
  if (!canvas || !stage || !context) return; // narrows all three for the closures below

  let palette = readPalette(stage);

  const resize = () => {
    const bounds = stage.getBoundingClientRect();
    const width = Math.max(120, Math.round(bounds.width || 220));
    const height = Math.max(82, Math.round(bounds.height || 120));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    palette = readPalette(stage);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  const tick = (time: number, deltaMs: number) => {
    // ...advance by deltaMs and draw using context/palette/canvas dimensions...
  };
  const stopAnimation = startAnimationLoop({ element: canvas, fps: 30, onFrame: tick });

  return () => {
    observer.disconnect();
    stopAnimation();
  };
}, [/* settings that should restart the loop */]);
```

```tsx
<div ref={stageRef} style={{ flex: "1 1 auto", position: "relative", overflow: "hidden" }}>
  <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
</div>
```

The TypeScript-safety trick: guard `canvas`/`stage`/`context` together in one
`if (!canvas || !stage || !context) return;` at the top of the effect, then
only ever reference the narrowed local consts (`canvas`, `stage`, `context`)
inside `resize`/`tick` — reaching back through `canvasRef.current` inside the
same effect re-introduces the nullable type and defeats the narrowing, which
is exactly what produces the "possibly null" errors this pattern avoids.
`startAnimationLoop` also caps draw work and completely pauses while the
widget is off-screen or the document is hidden. Use 20-30 FPS for decorative
motion; reserve 60 FPS for interaction that demonstrably needs it.

### Write plain ASCII — no smart punctuation

Generated files are written by an LLM piping output through a subprocess shell.
Smart quotes (`’ ‘ “ ”`), em/en dashes (`— –`), and other non-ASCII punctuation
in comments or strings have corrupted output before and forced a full file
rewrite. Use straight quotes (`'`/`"`), a plain hyphen (`-`), and `->`/`=>`
instead of arrow glyphs, in both code and comments.

### Optional API route

If the widget needs server-side data fetching (to hide a key or call an
external API), also write `app/api/<slug>/route.ts` following the same
proxy pattern as the rest of `app/api/` — never call third-party APIs with
secrets directly from the client component.

---

## Iframe widgets (LLM / no-rebuild path)

Iframe widgets let you add content without touching any React or TypeScript code.
The widget renders in a sandboxed `<iframe>` — you write one HTML file and one
JSON entry, nothing else. **No bundler step, no restart.**

### What to create

```text
public/custom-widgets/<id>/
  index.html       ← your entire widget (HTML + inline CSS + inline/linked JS)
```

Add one entry to [`config/customRegistry.json`](../config/customRegistry.json):

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

That is the complete installation. The widget appears in the Hub widget manager
automatically. No other file needs to change.

### What NOT to touch

When creating or generating an iframe widget, **never modify**:

- `config/widgets.tsx`
- `config/customComponentMap.tsx`
- `components/framework/` (any file)
- `components/widgets/default/` (any file)
- `lib/` (any file)
- `app/` (any file)
- `styles/globals.css`

Touching any of those can break the core hub. The only two files an iframe widget
ever needs are `index.html` + the `customRegistry.json` entry.

### Receiving theme tokens

The host sends a `NUTMAG_THEME` message immediately after the iframe loads and
again whenever the user changes theme or palette. Apply the tokens as CSS variables:

```html
<script>
  window.addEventListener("message", (e) => {
    if (e.data?.type !== "NUTMAG_THEME") return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(e.data.tokens)) {
      root.style.setProperty(name, value);
    }
    root.dataset.mode = e.data.mode;       // "dark" | "light"
    root.dataset.palette = e.data.palette; // "ember" | "slate" | "moss" | "plum"
  });
</script>
```

Token names match the design system exactly: `--bg-card`, `--text-primary`,
`--accent-orange`, `--accent-cyan`, `--border`, `--shadow`, etc. Use them in
your CSS — never hard-code hex values.

### Receiving size and settings

The host sends `NUTMAG_CONTEXT` on load and whenever the user resizes the widget
or changes its settings in the gear popover:

```js
window.addEventListener("message", (e) => {
  if (e.data?.type !== "NUTMAG_CONTEXT") return;
  const { size, settings } = e.data;
  // size: "S" | "M" | "L"
  // settings: { [key]: value } — values from the manifest settings schema
  render(size, settings);
});
```

### Reporting height

If your content has a dynamic height, tell the host so the card resizes:

```js
function reportHeight() {
  window.parent.postMessage(
    { type: "NUTMAG_RESIZE", height: document.body.scrollHeight },
    window.location.origin,
  );
}
// call after initial render and after any content change
```

If you don't send `NUTMAG_RESIZE`, the iframe defaults to 128px tall. Set a
fixed height in your CSS if your content is a known size.

### Fetching data

Since the iframe is same-origin, you can call any of the hub's API routes directly:

```js
const res = await fetch("/api/now-playing");
const data = await res.json();
```

### Minimal template

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    :root { --bg-card: #1e1a14; --text-primary: #e8dfc8; }
    body { margin: 0; padding: 12px; background: var(--bg-card); color: var(--text-primary);
           font-family: monospace; box-sizing: border-box; }
  </style>
</head>
<body>
  <div id="root">loading…</div>
  <script>
    window.addEventListener("message", (e) => {
      if (e.data?.type === "NUTMAG_THEME") {
        for (const [k, v] of Object.entries(e.data.tokens))
          document.documentElement.style.setProperty(k, v);
      }
      if (e.data?.type === "NUTMAG_CONTEXT") {
        // e.data.size, e.data.settings
      }
    });

    async function init() {
      // fetch data, build DOM …
      document.getElementById("root").textContent = "hello from iframe";
      window.parent.postMessage(
        { type: "NUTMAG_RESIZE", height: document.body.scrollHeight },
        window.location.origin,
      );
    }
    init();
  </script>
</body>
</html>
```

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

---

## Optional: turn this guide into a harness skill

This is wired up — AVN Hub ships **two** harness skills, both generated by
`scripts/sync-widget-skill.mjs` (run `npm run sync:widget-skill` after
editing either source):

| Skill | Source | Used by |
| --- | --- | --- |
| `avn-widget-build` | `lib/widget-creator/prompts/widget-build-spec.md` | `generate` route (Build mode), all 3 harnesses |
| `avn-widget-plan` | `lib/widget-creator/prompts/widget-plan-context.md` | `plan` route (Plan mode), `codex`/`opencode` only — see below |

**This doc and `avn-widget-build` are two deliberately separate files, not
one auto-sliced into the other.** This doc still matters for the same reason
it always did — it's the canonical human reference (linked from
`docs/README.md`, `FEATURES.md`, and `WIDGET_CREATOR_GUIDE.md`) and the path
for anyone hand-writing a widget without the AI at all. The skill has its own
tighter, AI-only source: same rules, denser format, no narrative — because a
harness pays real tokens for every word of a loaded skill and a human doesn't.
Concretely, this doc is ~32KB; `widget-build-spec.md` is ~9KB. **When a rule
changes here, mirror it into `widget-build-spec.md` by hand** — they're
independently maintained on purpose, so there's no script enforcing they stay
in sync; only that both are internally consistent with the actual framework.

Each skill is written to both `.claude/skills/<name>/SKILL.md` and
`.agents/skills/<name>/SKILL.md` — both committed to the repo, so every
clone/deploy has them with no setup. `opencode` reads both of those
locations on top of its own `.opencode/skills/`, so together they cover all
three harnesses: `claude` + `opencode` from the first, `codex` + `opencode`
from the second.

**Why this exists:** `codex exec` and `opencode run` (no `claude`-style
`--append-system-prompt` flag) previously got a ~24KB doc embedded raw into
the prompt on every single turn — the single biggest avoidable token cost in
the Widget Creator. `app/api/widget-creator/generate/route.ts` now sends a
short "load the skill" instruction instead, on all three harnesses uniformly
(no more Windows-only `--append-system-prompt` ARG_MAX workaround needed
either, since a skill reference costs a few dozen tokens regardless of
platform). Splitting the skill into its own hand-tightened spec (rather than
slicing this doc verbatim) cut the loaded skill from ~27KB to ~9KB on top of
that — most of this doc's built-in-widget material (`config/widgets.tsx`
registration, `DEFAULT_ORDER`, `SPAN_MAP`) doesn't even apply to what the
Widget Creator actually generates (it only ever writes the custom-widget
split-registry pattern), so the AI spec drops that entirely and keeps only
what a custom-widget generation actually needs.

**Generation refuses to proceed if the skill file is missing.** `generate`
checks the resolved harness's skill path before spawning it and fails with a
clear error (not a silently-degraded prompt) if it's absent — see
`lib/widget-creator/skillCheck.ts`. In normal use this never fires: the
skill files are committed to the repo, so they're just *there* on every
clone. If you do hit it, run `npm run sync:widget-skill`.

This was verified empirically, not assumed from docs: `codex exec --json`,
`opencode run --format json`, and codex's `--sandbox read-only` mode
specifically (Plan mode's exact restriction), all run from this repo's root
exactly as `harnessRunner.ts`/`chatHarness.ts` invoke them, correctly
discovered both skills, quoted back their `description` fields on request,
and — for a real end-to-end check, not just discovery — actually produced
correct output when asked to use them for real (a generated widget that
passed `tsc --noEmit`, and Plan-mode suggestions that never duplicated the
live widget catalog and correctly reflected the region/size guidance from
`avn-widget-plan`).

**What didn't get a skill:**
- **Ideate mode** (`app/api/widget-creator/ideate/route.ts`) keeps its style
  reference inline. It's a few hundred tokens (not 24KB) and every Ideate
  call is a fresh one-shot request with no session to resend it across — a
  skill wouldn't meaningfully help here.
- **Plan mode on `claude` specifically.** Its invocation runs with
  `--tools ""` — all tools disabled, including the `skill` tool a harness
  needs to load one — by deliberate design, so the conversational
  brainstorming mode never gets file/shell access. `codex`/`opencode`'s Plan
  invocations don't have that restriction (verified directly), so they use
  `avn-widget-plan`; `claude` gets the same content inlined instead, read at
  request time from the same source file the skill is generated from — one
  copy, two delivery paths, not a hand-maintained duplicate.

**One thing a skill can't do:** it's a static file. The *dynamic* parts of
these prompts — the live widget catalog, the user's current settings, an
edit's existing source — are rebuilt fresh per request specifically so
they're never stale, and keep being injected as normal prompt content
regardless of the skill. A skill replaces the static procedural half of a
prompt — not the whole thing.

### Setting up your own skill

Beyond the two above, any `SKILL.md` you drop in the right place is picked
up automatically — useful if you want to teach a harness something about a
part of AVN Hub these two don't cover. The format is the same across all
three CLIs:

```markdown
---
name: kebab-case-name
description: One sentence a harness uses to decide whether to load this - be specific about when it applies.
---

Markdown instructions go here. This is the full content the harness reads
once it decides to load the skill.
```

Discovery paths, walked from the current directory up to the repo root
(project-local) plus a global fallback:

| Harness | Project-local | Global |
| --- | --- | --- |
| `claude` | `.claude/skills/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |
| `codex` | `.agents/skills/<name>/SKILL.md` | `~/.agents/skills/<name>/SKILL.md` |
| `opencode` | `.opencode/skills/`, `.claude/skills/`, or `.agents/skills/` | `~/.config/opencode/skills/`, `~/.claude/skills/`, or `~/.agents/skills/` |

Since `opencode` reads all three project-local locations, a skill placed
under `.claude/skills/` or `.agents/skills/` is automatically picked up by
`opencode` too — you only need a second copy if you also want `claude` (from
`.claude/skills/`) *and* `codex` (from `.agents/skills/`, which `claude`
doesn't read) to both see it. That's exactly why `avn-widget-build` and
`avn-widget-plan` each ship two identical copies instead of one.

A harness only pays for a skill's full body once it actually loads it —
until then it only sees the `name` + `description`, so keep the description
specific enough that a harness can tell when it applies without guessing.
