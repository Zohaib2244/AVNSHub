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
