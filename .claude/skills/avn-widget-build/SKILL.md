---
name: avn-widget-build
description: Use when creating a new widget or editing an existing widget for AVN Hub (a Next.js personal dashboard). Covers the custom-widget split-registry pattern under components/widgets/custom/, per-size layout rules, the settings schema, design tokens, and iframe widgets. Trigger on any request to add, build, generate, scaffold, or edit a dashboard widget.
---

You are almost always generating a **custom widget** (the split-registry
pattern below) — not editing the built-in `config/widgets.tsx` registry.
Never touch `config/widgets.tsx`, `config/customRegistry.json`,
`config/customComponentMap.tsx`, `lib/layout.ts`, `components/framework/`,
or `components/widgets/default/`. Registration happens automatically after
you write your files.

## Files (the whole pattern)

```text
components/widgets/custom/<slug>/<Pascal>Widget.tsx   - the component
components/widgets/custom/<slug>/manifest.json         - the manifest, as data
```

`<slug>` is kebab-case (e.g. `cube-timer`). `<Pascal>Widget` is
PascalCase(slug) + `Widget` (e.g. `cube-timer` -> `CubeTimerWidget`),
exported as a **named export** matching the file basename:
`export function CubeTimerWidget() { ... }`.

## Component rules

- `"use client"` at the top if it uses hooks/state/effects (almost always).
- Render **markup only** — no `.block`/`.capsule`/label wrapper; the shell
  owns all of that.
- Read placement/config via `useWidget()` — never props:
  `{ id, size, orientation, settings, isFocused }`
  - `size`: `"S" | "M" | "L"` — branch on it for a distinct layout per size
    (see below). `settings` is an untyped bag resolved from your manifest's
    `settings` schema — narrow types before use, e.g.
    `settings.showStats !== false` (toggle, default true).
  - `isFocused`: `true` only when the user has clicked this widget's card.
    Gate every `keydown`/`keyup`/`keypress` listener on it
    (`if (!isFocused) return;` at the top of the handler, and include it in
    the effect's dependency array) so typing elsewhere never triggers it.
- Data fetching: `usePolling<T>(url, intervalMs)` from `@/lib/usePolling` —
  never a bare `setInterval`. Formatters: `timeAgo`, `formatDuration`,
  `formatMins` from `@/lib/format`.
- Class vocabulary (inherits the theme automatically): `block-value`
  (`.accent`/`.teal`), `block-sub`, `block-stat`, `more-head`,
  `more-row`/`more-meta`.
- **No sibling CSS file** — style with `CSSProperties`/inline `style={{}}`,
  reading the same CSS variables the rest of the app uses. Never hard-code
  hex or font names.
  ```tsx
  const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
  const labelStyle: CSSProperties = {
    fontFamily: "var(--font-dot-gothic), monospace",
    fontSize: "0.62rem",
    textTransform: "uppercase",
  };
  ```
  Color tokens: `--text-primary`, `--text-muted`, `--accent-orange`,
  `--accent-cyan`, `--border`, `--bg-card`, `--bg-nested`, `--shadow`.
  Card look: border-radius 12-16px, 1.5px solid border, hard-offset
  `boxShadow` like `"3px 3px 0 var(--shadow)"` — **never blurred**.

## Per-size UI (the core feature)

Distinct layouts per size, not the same content scaled up:

```tsx
const { size } = useWidget();
if (size === "S") return <CompactView />;   // one glanceable stat/status
if (size === "M") return <StandardView />;  // the default view
return <RichView />;                         // L: more rows, detail, controls
```

A widget with L-only content must include `"L"` in its manifest `sizes`, or
the user can never reach that layout.

## Space discipline (widgets live in a hard size budget)

A widget renders inside a dashboard grid cell, NOT a page. The user resizes
widgets freely, and `size` is picked from the cell's **real pixel box**
(outer size, before the card's ~14px/16px padding and header):

- **S**: narrower than 300px OR shorter than 150px. This covers tiny
  squares (~236x96) but also tall-narrow (~236x204) and wide-short strips
  (~485x96, ~727x120). Design S for BOTH shapes: never assume S is wide
  or tall.
- **M**: everything between S and L, typically ~485x204 up to ~485x312.
- **L**: at least 600x250 OR 400x400.
- `orientation` is `"v"` when the box is taller than wide, else `"h"`.

The user can also pin a widget to any size it declares ("layout size" in its
settings), which overrides the box. So any layout may occasionally render in a
box smaller than its range above: it must clip cleanly, never break or spill.

Within one size the box still varies a lot, so layouts must **flex to the
space**, never assume exact pixels. Rules that follow from this:

- The root element must fill its container (`height: 100%`) and NEVER
  overflow it. No fixed pixel widths/heights, no `min-width` larger than
  ~200px, no page-level scrolling.
- If content can outgrow the space (lists, logs, history), give THAT inner
  area `overflow-y: auto` and `min-height: 0` on its flex parents — never
  `overflow: hidden` on an area holding controls or text the user needs.
- **Every horizontal row must be able to shrink.** Put `minWidth: 0` on
  flex children that hold text or inputs, and `flex: "0 0 auto"` on buttons
  and icons so they stay visible while the text/input gives way. A row
  whose total intrinsic width is wider than ~200px will be cut off at S.
- **Text entry: use an auto-growing `<textarea rows={1}>`, not
  `<input type="text">`**, for anything a user may type more than a few
  words into. Set `resize: "none"`, `width: "100%"`, `minWidth: 0`,
  `boxSizing: "border-box"`, `overflowWrap: "anywhere"`, and on every
  change set `height = "auto"` then `height = min(scrollHeight, cap)` with
  `overflowY: "auto"` past the cap (pick a cap that fits the size: ~48px S,
  ~64px M, ~96px L). Enter submits, Shift+Enter inserts a newline.
- User-authored text in lists wraps (`overflowWrap: "anywhere"`,
  `whiteSpace: "pre-wrap"`) inside a scrolling list; clamp it with
  `WebkitLineClamp` only in S where there's no room to scroll.
- **One primary action per control.** Never render a second button that
  duplicates another (e.g. a header "Add" plus the form's own "Add").
- Density over decoration: paddings 8-12px, gaps 4-8px, inputs ~24-28px
  tall, font sizes on the small end of the token scale. Every element must
  earn its pixels.
- A smaller size shows FEWER things, not everything smaller. S shows the
  single most useful thing plus at most one control; secondary sections
  (history, "done" lists, stats) are L-only or hidden behind a tab.
- Prefer one focused view with a compact switcher (tabs, chips) over
  stacked or side-by-side sections — a collapsible section below a list
  steals height and gets cropped; a tab that swaps the list does not.
- Don't repeat the widget's own title inside the component — the shell's
  header already shows it (or the user has hidden it on purpose).
- Short labels/values truncate (`textOverflow: "ellipsis"`,
  `whiteSpace: "nowrap"`, `overflow: "hidden"`, `minWidth: 0`).
- If the widget is unusable below some size, declare `minPx` in the
  manifest (below) instead of cramming — resizes then stop there.

## manifest.json shape

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

- `minPx` (optional) — `{ "width": number, "height": number }`, the
  smallest outer cell box in px the widget still works in; drag-resize
  won't go below it. Omit it unless the widget truly breaks when small. A
  widget whose `sizes` lack `"S"` already gets a 300x150 floor.
- `iconName` — a `lucide-react` icon name as a **string**, PascalCase (no
  import in this file).
- `settings` — each field is one of: `{type:"toggle",default:boolean}`,
  `{type:"select",default:string,options:[{value,label}]}`,
  `{type:"text",default:string,placeholder?}`,
  `{type:"number",default:number,min?,max?}` — use `[]` for none.
  `defaults.size`/`defaults.orientation` must be members of
  `sizes`/`orientations`.

## Minimal complete example

The whole pattern in one copy-pasteable shape:

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

## Canvas / animated widgets

For anything drawn frame-by-frame (waveforms, physics sims, visualizers) —
this is the whole pattern, already TypeScript-strict-null-safe. You do not
need to read any other widget's code to find this pattern; copy it:

```tsx
const canvasRef = useRef<HTMLCanvasElement | null>(null);
const stageRef = useRef<HTMLDivElement | null>(null); // wrapper div sized by CSS flex/grid

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

  let frame = 0;
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

  const tick = () => {
    // ...draw using `context`, `palette`, canvas.width/ratio-adjusted size...
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}, [/* settings that should restart the loop */]);

// JSX: <div ref={stageRef} style={{ flex: "1 1 auto", position: "relative", overflow: "hidden" }}>
//        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
//      </div>
```

Rules that keep this TypeScript-clean: guard `canvas`/`stage`/`context` together
in one `if (!canvas || !stage || !context) return;` at the top of the effect
(not separately later), and only reference the narrowed local consts
(`canvas`, `stage`, `context`) inside `resize`/`tick` — never `canvasRef.current`
again inside the same effect, since the ref access re-introduces the nullable
type and defeats the narrowing.

## Optional API route

If the widget needs server-side data fetching (to hide a key or call an
external API), also write `app/api/<slug>/route.ts` following the same
proxy pattern as the rest of `app/api/` — never call third-party APIs with
secrets directly from the client component.

## Iframe widgets (alternate path — no React/TS at all)

If a request is better served as an `<iframe>` (arbitrary HTML/CSS/JS, no
bundler step) instead of a real component:

```text
public/custom-widgets/<id>/index.html   - the entire widget
```

Plus one `config/customRegistry.json` entry:

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

That's the complete installation — never touch `config/widgets.tsx`,
`config/customComponentMap.tsx`, `components/framework/`,
`components/widgets/default/`, `lib/`, `app/`, or `styles/globals.css` when
authoring an iframe widget.

The host sends `postMessage` events the iframe should handle:
- `NUTMAG_THEME` (on load + on theme/palette change) — `{ tokens, mode, palette }`; apply `tokens` as CSS custom properties on `documentElement`.
- `NUTMAG_CONTEXT` (on load + on resize/settings change) — `{ size, settings }`.

Report height changes back: `window.parent.postMessage({ type: "NUTMAG_RESIZE", height: document.body.scrollHeight }, window.location.origin)` — without this the iframe defaults to 128px tall. Same-origin, so it can call any hub API route directly, e.g. `fetch("/api/now-playing")`.

## Write plain ASCII — no smart punctuation

Generated files are written by piping output through a subprocess shell.
Smart quotes, em/en dashes, and other non-ASCII punctuation in comments or
strings have corrupted output before. Use straight quotes, a plain hyphen,
and `->`/`=>` instead of arrow glyphs.

## Don't

- Reuse an existing `id`/slug, or rename one casually.
- Fetch with a bare `setInterval` — use `usePolling`.
- Hard-code colors or fonts — use the CSS variable tokens.
- Attach `framer-motion layout` or dnd-kit `animateLayoutChanges` to grid
  items — dense grid reflow + per-item re-measure loops into "Maximum
  update depth exceeded".
- Render `.block`/`.capsule`/label markup inside the component — the shell
  owns that.
- Reintroduce hover/click flyouts, overlay modals, or neighbor-cascading
  expansion for Hover On Expand — a prior version of this caused reflow
  loops. Hover On Expand is transient preview boxes only, no persisted state.
- Create, edit, or delete a `SPEC.md` in the widget's own folder — the
  platform writes/updates it automatically after every successful turn from
  the creator's settings. If one is included above under "Project spec", it
  is already the authoritative context; don't second-guess it by exploring.
- **Delete, move, or rename the component `.tsx` when editing it — always
  rewrite it in place.** The hub runs against a live dev server that
  recompiles on every file event, and `config/customComponentMap.tsx` holds a
  static import of this exact path. If the file is absent for even the moment
  between a delete and the write that follows, that import fails to resolve
  and the *entire dashboard* 500s — not just this widget — until the file is
  back. Removing it first to "start clean" is never worth that. Same reason:
  don't rename the file to change a component's name.
