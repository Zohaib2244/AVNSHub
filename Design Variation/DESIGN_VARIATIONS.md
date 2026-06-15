# Design System — NutMag Card

**Status: Finalized.** Direction chosen: **"G — Chunky Blocks + Accent Border"**, in both dark and light themes, with a hover-to-expand capsule interaction. This is the spec to build up on.

Live reference mockup: [`DESIGN_VARIATIONS.html`](./DESIGN_VARIATIONS.html) — open directly in a browser, no build step. Look at the 4th column ("G") in both the Dark Mode and Light Mode sections.

---

## Color tokens

### Dark
| Token | Value | Usage |
|---|---|---|
| Page background | `#13100c` | `<body>` / outer page |
| Card background | `#1e1a14` | namecard, blocks |
| Nested surface | `#1a1610` | bubbles/fields nested inside a card |
| Border | `#3d3220` | 1.5px card borders |
| Sticker shadow | `#070604` | hard offset box-shadow |
| Text primary | `#e8dfc8` | values, logo |
| Text muted (label) | `#4a4030` | labels, links, sub text |
| Text muted (dim) | `#3a3020` | section sub, dimmer labels |
| Orange accent | `#ff6b2b` | live badge, accent borders, "hot" values |
| Cyan/teal accent | `#00b4c8` | secondary live values, stat numbers |

### Light
| Token | Value | Usage |
|---|---|---|
| Page background | `#d8cfbc` | `<body>` / outer page |
| Card background | `#f5f0e6` | namecard, blocks |
| Nested surface | `#faf6f0` | bubbles/fields nested inside a card |
| Border | `#7a6a52` | 1.5px card borders |
| Sticker shadow | `#a89878` | hard offset box-shadow |
| Text primary | `#1c1810` | values, logo |
| Text muted (label) | `#9a8870` | labels, links, sub text |
| Text muted (dim) | `#b0a090` | section sub, dimmer labels |
| Orange accent | `#e05a18` | live badge, accent borders, "hot" values |
| Teal accent | `#00768a` | secondary live values, stat numbers |

---

## Typography scale

| Role | Size | Font | Notes |
|---|---|---|---|
| Logo / wordmark | `1.7rem` | DotGothic16 | `letter-spacing: 0.04em` |
| Headline stat (uptime %, etc.) | `2.2rem` | DotGothic16 | `line-height: 1` — largest element on the page |
| Primary value (track/game/project name) | `1.25rem` | JetBrains Mono | `font-weight: 500` |
| Sub text (artist, hours, commit meta) | `0.75rem` | JetBrains Mono | muted color |
| Section/field label | `0.62rem` | DotGothic16 | uppercase, `letter-spacing: 0.14em` |
| Chips / pills / badges | `0.6–0.65rem` | JetBrains Mono | uppercase |
| Icons | 14×14px | Lucide | `stroke-width: 1.75` |

---

## Layout

```
┌──────────────────────────────────────────────┐
│  NAMECARD  (logo+tagline+links | live badge)  │
├───────────────────────┬────────────────────────┤
│  Now Playing (.al)    │  Currently Playing      │  ← paired row, flex
├───────────────────────┴────────────────────────┤
│  Currently Building (.al, full width)          │  ← standalone hero block
├───────────────────────┬────────────────────────┤
│  Homelab               │  Stack                  │  ← paired row, flex
└───────────────────────┴────────────────────────┘
```

- **Namecard**: identity (logo, tagline, links) on the left; live badge + tagline on the right
- **Blocks**: `border-radius: 12–16px`, `border: 1.5px solid` (border token), hard offset `box-shadow: 3-5px 3-5px 0` (shadow token, **no blur**) — the "sticker/stamp" treatment
- **Accent border**: featured blocks (Now Playing, Currently Building) get `border-left: 3px solid` orange accent (`.al` modifier in the mockup)
- **Paired rows**: Now Playing/Currently Playing and Homelab/Stack sit side-by-side as flex children

---

## Interaction — Hover-to-Expand Capsules

Each block in a paired row is a flex item: `flex-grow: 1; flex-shrink: 1; flex-basis: 0%; min-width: 0`.

On hover over a block:
1. Hovered block → `flex-grow: 2.5`; sibling(s) → `flex-grow: 0.65` — `transition: flex-grow 0.4s cubic-bezier(0.4, 0, 0.2, 1)`
2. The shrunken sibling's primary value truncates with an ellipsis (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`)
3. The hovered block's border brightens to the orange accent and its sticker shadow offset increases (5px instead of 3px) — a "pressed forward" feel
4. A "more info" panel reveals below the existing content (`max-height: 0 → 240px`, `opacity: 0 → 1`, `margin-top: 0 → 10px`), containing extra contextual data:

| Block | "More" content |
|---|---|
| Now Playing | Recently played tracks (track — artist) |
| Currently Playing | Recently played games (name — hours total) |
| Currently Building | Recent commits (message — relative time) |
| Homelab | Per-service uptime breakdown (service — uptime % · window) |
| Stack | What each tool is currently used for |

Standalone full-width blocks (Currently Building) get steps 2–4 of the hover state without the flex rearrangement — there are no siblings to shrink.

---

## Implementation notes
- `DESIGN_VARIATIONS.html` uses `.dg-*` (dark G) / `.lg-*` (light G) class names as a reference — port these patterns into Tailwind utilities + component-scoped styles per [`CLAUDE.md`](./CLAUDE.md)
- Both themes are fully designed; implement dark as default with a theme toggle (Post-MVP Backlog in `CLAUDE.md`)
- Everything below this line is the original brainstorm that led here — kept for historical context only

---

<details>
<summary>Original brainstorm variations (superseded)</summary>

# Design Variation References — NutMag Card

Based on your orange/cyan/retro/offwhite theme, here are 4 distinct approaches. Pick elements you like; we'll synthesize a direction.

---

## Variation 1: Brutalist Grid (Inspired by Early Web/Unix Aesthetics)
**Vibe**: Raw, geometric, monospace-heavy. Nothing Phone meets 90s terminal UI.

- **Layout**: Strict CSS grid, visible gutters (1px borders in cyan)
- **Modules**: Square tiles on dark background, each with a thick cyan border
- **Typography**: All DotGothic16 (even body), extreme contrast
- **Accents**: Orange used only for "hot" states (playing, online, building)
- **Animation**: None — or rare, jittery state changes (glitch style)
- **Background**: Solid `#0d0d0f`, no grain/scanlines
- **Hierarchy**: Bold borders, no shadows

### Key Files to Update:
- Remove grain overlay from `globals.css`
- Restyle components to use borders instead of shadows
- Make grid explicit in layout

---

## Variation 2: Analog/Mechanical (Inspired by Old Dashboards — VU Meters, Dials)
**Vibe**: Physical instrument aesthetic. Warm beige front panel with pop of neon.

- **Layout**: Asymmetric but grounded; "panels" with beveled edges (inset shadows)
- **Modules**: Cream (`#e8dfc8`) background for each card, dark text inside, orange/cyan borders as "trim"
- **Typography**: DotGothic16 for labels/readouts, JetBrains Mono for numbers
- **Accents**: Orange for "hot" readouts (now playing), cyan for status indicators (dots)
- **Animation**: Mechanical needles, analog dials (framer motion pointer tracking)
- **Background**: Dark grain, maybe subtle paper texture
- **Hierarchy**: Depth via beveling, no modern shadows

### Key Files to Update:
- New component: `AnalogPanel.tsx` wrapper with inset border styling
- Grain overlay stays, maybe increase intensity
- Add mechanical micro-animations to data changes

---

## Variation 3: Neon Minimalist (Bold, Modern Cyberpunk)
**Vibe**: Less retro, more synthwave. Clean lines, glowing accents.

- **Layout**: Centered or floating modules, lots of whitespace (dark negative space)
- **Modules**: Thin outlines (1px), glowing on focus/hover (drop-shadow glow in orange/cyan)
- **Typography**: DotGothic16 for headers only, JetBrains Mono for everything else, very sparse
- **Accents**: Neon cyan text on dark, orange only for CTAs or status "hot" states
- **Animation**: Smooth, subtle glow pulse, text reveal on load
- **Background**: Solid black `#0d0d0f`, maybe very faint cyan vertical scanlines (not pervasive)
- **Hierarchy**: Extreme minimalism — only what's essential visible

### Key Files to Update:
- Strip out non-essential UI elements
- Add glow filters to CSS (`filter: drop-shadow`)
- Simplify color palette in components

---

## Variation 4: Deconstructed/Brutalist-Modern Hybrid
**Vibe**: Current design energy but with more breathing room and a clearer hierarchy.

- **Layout**: Asymmetric but with intentional spacing (not packed)
- **Modules**: Varied sizes and border styles (some thick orange, some thin cyan)
- **Typography**: DotGothic16 for labels, JetBrains Mono for data; let whitespace breathe
- **Accents**: Orange for identity/building, cyan for live indicators, cream for secondary accents (borders, hover)
- **Animation**: Micro: slow pulse on live elements, smooth data transitions, no jitter
- **Background**: Grain + scanlines, but softer (lower opacity)
- **Hierarchy**: Clear layering via borders and spacing, not shadows

### Key Files to Update:
- Increase padding/margins in component spacing
- Reduce grain opacity in `globals.css`
- Vary border thickness and color per component type

---

## Quick Comparison Table

| Aspect | Brutalist Grid | Analog/Mechanical | Neon Minimalist | Deconstructed Hybrid |
|---|---|---|---|---|
| **Warmth** | Cold | Very warm | Cool | Balanced |
| **Complexity** | Minimal | Medium-High | Minimal | Medium |
| **Retro Factor** | 1980s UI | 1970s Hardware | Synthwave | 1990s Web |
| **Grain** | No | Yes, heavy | Minimal | Yes, soft |
| **Animation** | None/Glitch | Mechanical | Smooth glow | Smooth + Pulse |
| **Best for** | Stark, focused | Cozy, detailed | Modern, clean | Current vibe, refined |

</details>
